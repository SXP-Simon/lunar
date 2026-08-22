import type {
  LoadedReaderPublication,
  ReaderFontRegistry,
  ReaderImageDecoder,
  ReaderLayoutRequest,
  ReaderOpenRequest,
  ReaderRenderFrame,
  ReaderTextMeasurer,
} from '../contracts';
import type {
  ReaderPaginationProgressResponse,
  ReaderWorkerResponse,
} from './background-runtime-protocol';

export interface ReaderPaginationBackendOpenOptions {
  readonly request: ReaderOpenRequest;
  readonly layout: ReaderLayoutRequest;
  readonly data: ArrayBuffer;
  readonly revisionId: number;
  readonly operationId: number;
  readonly signal: AbortSignal;
  readonly cacheKey?: string;
  readonly textMeasurer?: ReaderTextMeasurer;
  readonly fontRegistry?: ReaderFontRegistry;
  readonly imageDecoder?: ReaderImageDecoder;
  readonly onProgress?: (response: ReaderPaginationProgressResponse) => void;
}

export interface ReaderPaginationBackendResult {
  readonly publication: LoadedReaderPublication;
  readonly revisionId: number;
  readonly operationId: number;
}

export interface ReaderPaginationBackend {
  open(options: ReaderPaginationBackendOpenOptions): Promise<ReaderPaginationBackendResult>;
  getFrame(
    revisionId: number,
    spreadIndex: number,
  ): Promise<ReaderRenderFrame | undefined>;
  cancel(operationId: number, revisionId: number): Promise<void>;
  close(): Promise<void>;
}

export interface ReaderPaginationFallbackEvent {
  readonly phase: 'open' | 'get-frame';
  readonly error: unknown;
}

export type ReaderPaginationBackendResponse = ReaderWorkerResponse;

export class FallbackPaginationBackend implements ReaderPaginationBackend {
  private active?: ReaderPaginationBackend;
  private lastOpenOptions?: ReaderPaginationBackendOpenOptions;

  constructor(
    private readonly primary: ReaderPaginationBackend,
    private readonly fallback: ReaderPaginationBackend,
    private readonly onFallback?: (event: ReaderPaginationFallbackEvent) => void,
  ) {}

  async open(options: ReaderPaginationBackendOpenOptions): Promise<ReaderPaginationBackendResult> {
    this.lastOpenOptions = options;
    try {
      const result = await this.primary.open(options);
      this.active = this.primary;
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      this.onFallback?.({ phase: 'open', error });
      await closeQuietly(this.primary);
      const result = await this.fallback.open(options);
      this.active = this.fallback;
      return result;
    }
  }

  async getFrame(revisionId: number, spreadIndex: number): Promise<ReaderRenderFrame | undefined> {
    const active = this.active ?? this.fallback;
    try {
      const frame = await active.getFrame(revisionId, spreadIndex);
      if (frame || active !== this.primary) {
        return frame;
      }
      throw new Error('The Worklet pagination session has no frame state.');
    } catch (error) {
      if (active !== this.primary || isAbortError(error)) {
        throw error;
      }
      const options = this.lastOpenOptions;
      if (!options || options.revisionId !== revisionId) {
        throw error;
      }
      this.onFallback?.({ phase: 'get-frame', error });
      await closeQuietly(this.primary);
      const result = await this.fallback.open(options);
      this.active = this.fallback;
      return result.publication.getFrame(spreadIndex) ??
        (await this.fallback.getFrame(revisionId, spreadIndex));
    }
  }

  async cancel(operationId: number, revisionId: number): Promise<void> {
    await Promise.allSettled([
      this.primary.cancel(operationId, revisionId),
      this.fallback.cancel(operationId, revisionId),
    ]);
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.primary.close(), this.fallback.close()]);
    this.active = undefined;
    this.lastOpenOptions = undefined;
  }
}

async function closeQuietly(backend: ReaderPaginationBackend): Promise<void> {
  await backend.close().catch(() => undefined);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
