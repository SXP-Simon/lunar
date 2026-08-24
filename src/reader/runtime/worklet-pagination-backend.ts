import {
  createWorkletRuntime,
  runOnRuntimeAsync,
  type WorkletRuntime,
} from 'react-native-worklets';
import type {
  LoadedReaderPublication,
  ReaderBookMetadata,
  ReaderChapterRange,
  ReaderLayoutParameters,
  ReaderOpenRequest,
  ReaderRenderFrame,
  ReaderTocEntry,
} from '../contracts';
import {
  installNativeReaderWorkletRuntime,
} from '../native/archive-module';
import type { ReaderPaginationBackend, ReaderPaginationBackendOpenOptions, ReaderPaginationBackendResult } from './pagination-backend';
import {
  MemoryReaderPaginationSnapshotCache,
  type ReaderPaginationSnapshotCache,
} from './pagination-cache';
import {
  cancelReaderPagination,
  closeReaderPagination,
  getReaderPaginationFrame,
  openReaderPagination,
  probeReaderWorkerNativeBridge,
} from './reader-pagination-worker';

export interface ReaderWorkletPaginationDriver {
  open(request: ReaderWorkletOpenRequest): ReaderWorkletOpenResult;
  getFrame(request: ReaderWorkletFrameRequest): ReaderRenderFrame | undefined;
  cancel(request: ReaderWorkletCancelRequest): void;
  close(): void;
}

export interface ReaderWorkletOpenRequest {
  readonly request: ReaderOpenRequest;
  readonly data: ArrayBuffer;
  readonly operationId: number;
  readonly revisionId: number;
  /**
   * Development-only escape hatch. Production pagination requires a native
   * Worklet measurement bridge; the ordinary Expo module proxy is main-runtime
   * only.
   */
  readonly allowApproximateMeasurement?: boolean;
}

export interface ReaderWorkletOpenResult {
  readonly metadata: ReaderBookMetadata;
  readonly toc: readonly ReaderTocEntry[];
  readonly layout: ReaderLayoutParameters;
  readonly totalPages: number;
  readonly totalSpreads: number;
  readonly chapters: readonly ReaderChapterRange[];
  readonly chapterTimings: readonly {
    readonly chapterIndex: number;
    readonly pageCount: number;
    readonly durationMs: number;
  }[];
  readonly tocTargets: readonly (readonly [href: string, spreadIndex: number])[];
}

export interface ReaderWorkletFrameRequest {
  readonly revisionId: number;
  readonly spreadIndex: number;
}

export interface ReaderWorkletFrameResult {
  readonly frame: ReaderRenderFrame;
  readonly images: readonly { readonly source: string; readonly bytes: number[] }[];
}

export interface ReaderWorkletCancelRequest {
  readonly operationId: number;
  readonly revisionId: number;
}

/**
 * Runtime transport for the native build. Rito executes on a dedicated Worker
 * Runtime backed by a native asynchronous queue. Native text measurement is
 * resolved inside that Runtime, keeping individual width probes off the RN
 * and UI threads.
 */
export class WorkletPaginationBackend implements ReaderPaginationBackend {
  private readonly runtime: WorkletRuntime = createWorkletRuntime({
    name: 'LunarRitoPagination',
    enableEventLoop: true,
  });
  private readonly cache: ReaderPaginationSnapshotCache;
  private queue: Promise<unknown> = Promise.resolve();
  private publication?: SerializedReaderPublication;

  constructor(
    cache: ReaderPaginationSnapshotCache = new MemoryReaderPaginationSnapshotCache(),
    private readonly allowApproximateMeasurement = false,
  ) {
    this.cache = cache;
  }

  async open(options: ReaderPaginationBackendOpenOptions): Promise<ReaderPaginationBackendResult> {
    throwIfAborted(options.signal);
    // The index snapshot does not contain Rito's spread objects. Reusing it
    // without rebuilding the Worker publication makes getFrame() observe an
    // empty Worker state after close or process restart. Keep writing the
    // snapshot for future page-layer caching, while always opening the Worker
    // session until a rehydration protocol exists.
    try {
      const installed = installNativeReaderWorkletRuntime(this.runtime as unknown as object);
      if (!installed && !this.allowApproximateMeasurement) {
        throw createNativeWorkerUnavailableError(
          'The Lunar JSI bindings could not be installed on the pagination Worker Runtime.',
          'worker-runtime-install-unavailable',
        );
      }
      const probe = await this.enqueue(() =>
        runOnRuntimeAsync(this.runtime, probeReaderWorkerNativeBridge),
      );
      if (!probe.available && !this.allowApproximateMeasurement) {
        throw createNativeWorkerUnavailableError(
          'The pagination Worker Runtime does not have Lunar native text measurement installed.',
          probe.measureText
            ? 'worker-font-metrics-missing'
            : probe.resolveFontMetrics
              ? 'worker-text-measurement-missing'
              : 'worker-native-bindings-missing',
        );
      }
      const result = await this.enqueue(() => runOnRuntimeAsync(this.runtime, openReaderPagination, {
          request: options.request,
          data: options.data,
          operationId: options.operationId,
          revisionId: options.revisionId,
          allowApproximateMeasurement: this.allowApproximateMeasurement,
        }));
      throwIfAborted(options.signal);
      const publication = this.installPublication(result);
      if (options.cacheKey) {
        this.cache.set({ ...result, cacheKey: options.cacheKey, createdAt: Date.now() });
      }
      return { publication, operationId: options.operationId, revisionId: options.revisionId };
    } catch (error) {
      throw error;
    }
  }

  async getFrame(revisionId: number, spreadIndex: number): Promise<ReaderRenderFrame | undefined> {
    const result = await this.enqueue(() =>
      runOnRuntimeAsync(this.runtime, getReaderPaginationFrame, { revisionId, spreadIndex }),
    );
    if (!result) {
      throw new Error('The Worklet pagination session did not return a frame.');
    }
    this.publication?.installFrame(result);
    return result.frame;
  }

  async cancel(operationId: number, revisionId: number): Promise<void> {
    await this.enqueue(() =>
      runOnRuntimeAsync(this.runtime, cancelReaderPagination, { operationId, revisionId }),
    );
  }

  async close(): Promise<void> {
    await this.enqueue(() => runOnRuntimeAsync(this.runtime, closeReaderPagination));
    this.publication?.close();
    this.publication = undefined;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  private installPublication(result: ReaderWorkletOpenResult): SerializedReaderPublication {
    this.publication?.close();
    const publication = new SerializedReaderPublication(result);
    this.publication = publication;
    return publication;
  }
}

class SerializedReaderPublication implements LoadedReaderPublication {
  readonly metadata: ReaderBookMetadata;
  readonly toc: readonly ReaderTocEntry[];
  readonly layout: ReaderLayoutParameters;
  readonly totalPages: number;
  readonly totalSpreads: number;
  readonly chapters: readonly ReaderChapterRange[];
  readonly chapterTimings: readonly {
    readonly chapterIndex: number;
    readonly pageCount: number;
    readonly durationMs: number;
  }[];
  private readonly framesBySpread = new Map<number, ReaderRenderFrame>();
  private readonly imagesBySource = new Map<string, Uint8Array>();
  private readonly tocTargets: ReadonlyMap<string, number>;
  private closed = false;

  constructor(result: ReaderWorkletOpenResult) {
    this.metadata = result.metadata;
    this.toc = result.toc;
    this.layout = result.layout;
    this.totalPages = result.totalPages;
    this.totalSpreads = result.totalSpreads;
    this.chapters = result.chapters;
    this.chapterTimings = result.chapterTimings;
    this.tocTargets = new Map(result.tocTargets);
  }

  getFrame(spreadIndex: number): ReaderRenderFrame | undefined {
    return this.closed ? undefined : this.framesBySpread.get(spreadIndex);
  }

  getImage(source: string): Uint8Array | undefined {
    return this.closed ? undefined : this.imagesBySource.get(source);
  }

  resolveToc(href: string): number | undefined {
    return this.tocTargets.get(href) ?? this.tocTargets.get(decodeHref(href));
  }

  installFrame(result: ReaderWorkletFrameResult): void {
    if (this.closed) {
      return;
    }
    this.framesBySpread.set(result.frame.spreadIndex, result.frame);
    for (const image of result.images) {
      this.imagesBySource.set(image.source, Uint8Array.from(image.bytes));
    }
  }

  close(): void {
    this.closed = true;
    this.framesBySpread.clear();
    this.imagesBySource.clear();
  }
}

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }
  const error = new Error('Reader pagination was cancelled.');
  error.name = 'AbortError';
  throw error;
}

function createNativeWorkerUnavailableError(
  message: string,
  code = 'native-worker-bridge-unavailable',
  cause?: unknown,
): Error {
  const error = new Error(message);
  error.name = 'ReaderNativeWorkerUnavailableError';
  Object.defineProperty(error, 'code', {
    configurable: true,
    enumerable: true,
    value: code,
  });
  if (cause !== undefined) {
    Object.defineProperty(error, 'cause', {
      configurable: true,
      enumerable: false,
      value: cause,
    });
  }
  return error;
}
