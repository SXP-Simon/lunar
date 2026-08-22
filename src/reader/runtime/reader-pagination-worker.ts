import {
  createRitoDisplayListOptions,
  createRitoLayoutConfig,
  openRitoPaginationContext,
  toReaderLayoutParameters,
} from '../rito';
import type {
  ReaderChapterTiming,
  ReaderFontRegistry,
  ReaderFontResource,
  ReaderMeasurePaint,
  ReaderOpenRequest,
  ReaderTextMeasurer,
} from '../contracts';
import type {
  ReaderWorkletFrameRequest,
  ReaderWorkletOpenRequest,
  ReaderWorkletOpenResult,
  ReaderWorkletFrameResult,
  ReaderWorkletTextMeasurer,
} from './worklet-pagination-backend';
import { encodedImageDimensionDecoder } from './image-dimension-decoder';

interface WorkerState {
  readonly operationId: number;
  readonly revisionId: number;
  readonly publication: import('../contracts').LoadedReaderPublication;
}

let state: WorkerState | undefined;
const cancelledOperations = new Set<number>();

export interface ReaderWorkerNativeBridgeProbe {
  readonly sharedObjectClass: boolean;
  readonly resolver: boolean;
  readonly available: boolean;
}

/**
 * Checks the runtime-local Expo installation before a SharedObject is sent to
 * the Worker. A normal Expo module proxy cannot install these globals in a
 * custom runtime, so this probe prevents a later serializer failure from
 * looking like a pagination crash.
 */
export function probeReaderWorkerNativeBridge(): ReaderWorkerNativeBridgeProbe {
  'worklet';
  const expo = (globalThis as { expo?: { SharedObject?: { __resolveInWorklet?: unknown } } }).expo;
  const sharedObjectClass = typeof expo?.SharedObject === 'function';
  const resolver = typeof expo?.SharedObject?.__resolveInWorklet === 'function';
  return {
    sharedObjectClass,
    resolver,
    available: sharedObjectClass && resolver,
  };
}

export async function openReaderPagination(
  input: ReaderWorkletOpenRequest,
): Promise<ReaderWorkletOpenResult> {
  'worklet';
  if (!input.allowApproximateMeasurement) {
    if (!input.archive || !input.textMeasurer) {
      throw createNativeMeasurementUnavailableError();
    }
  }
  const fontRegistry = new WorkletFontRegistry();
  const textMeasurer = new WorkletTextMeasurer(input.textMeasurer);
  const request: ReaderOpenRequest = input.request;
  cancelledOperations.delete(input.operationId);
  const layout = createRitoLayoutConfig(request);
  const data = input.archive ? toArrayBuffer(input.archive.readAll()) : input.data;
  const context = await openRitoPaginationContext({
    data,
    layout,
    layoutParameters: toReaderLayoutParameters(layout, request),
    displayListOptions: createRitoDisplayListOptions(request),
    textMeasurer,
    fontRegistry,
    imageDecoder: encodedImageDimensionDecoder,
    lineBreaking: 'greedy',
  });
  try {
    const timings: ReaderChapterTiming[] = [];
    let done = false;
    let chapterIndex = 0;
    while (!done) {
      if (cancelledOperations.has(input.operationId)) {
        throw createAbortError();
      }
      const startedAt = Date.now();
      const chapter = context.paginateNextChapter();
      timings.push({
        chapterIndex,
        pageCount: chapter.pageCount,
        durationMs: Date.now() - startedAt,
      });
      done = chapter.done;
      chapterIndex += 1;
      if (!done) {
        await yieldToWorker();
      }
    }
    const publication = context.buildPublication(timings);
    const tocTargets = collectTocTargets(publication.toc, publication.resolveToc.bind(publication));
    const result: ReaderWorkletOpenResult = {
      metadata: publication.metadata,
      toc: publication.toc,
      layout: publication.layout,
      totalPages: publication.totalPages,
      totalSpreads: publication.totalSpreads,
      chapters: publication.chapters,
      chapterTimings: publication.chapterTimings,
      tocTargets,
    };
    state?.publication.close();
    state = { operationId: input.operationId, revisionId: input.revisionId, publication };
    return result;
  } finally {
    context.close();
  }
}

class WorkletFontRegistry implements ReaderFontRegistry {
  async loadFont(_resource: ReaderFontResource): Promise<void> {
    // The approximate development mode keeps the bytes in Rito, without
    // claiming that the Worker can access the Expo font proxy.
  }
}

class WorkletTextMeasurer implements ReaderTextMeasurer {
  constructor(private readonly native?: ReaderWorkletTextMeasurer) {}

  measureText(text: string, paint: ReaderMeasurePaint) {
    if (this.native) {
      return this.native.measureText({
        text,
        family: paint.font.family,
        weight: paint.font.weight,
        style: paint.font.style,
        sizePx: paint.font.sizePx,
        letterSpacingPx: paint.letterSpacingPx,
        wordSpacingPx: paint.wordSpacingPx,
      });
    }
    return {
      width:
        text.length * paint.font.sizePx * 0.55 +
        (paint.letterSpacingPx ?? 0) * text.length +
        (paint.wordSpacingPx ?? 0) * (text.match(/\s/g)?.length ?? 0),
      height: paint.font.sizePx,
    };
  }

  resolveFontMetrics(paint: ReaderMeasurePaint) {
    if (!this.native) {
      const size = paint.font.sizePx;
      return { ascentPx: size, descentPx: 0, lineGapPx: 0, contentHeightPx: size };
    }
    return this.native.resolveFontMetrics({
      family: paint.font.family,
      weight: paint.font.weight,
      style: paint.font.style,
      sizePx: paint.font.sizePx,
    });
  }
}


export function getReaderPaginationFrame(
  input: ReaderWorkletFrameRequest,
): ReaderWorkletFrameResult | undefined {
  'worklet';
  if (!state || state.revisionId !== input.revisionId) {
    return undefined;
  }
  const frame = state.publication.getFrame(input.spreadIndex);
  if (!frame) {
    return undefined;
  }
  return {
    frame,
    images: frame.imageSources.map((source) => ({
      source,
      bytes: Array.from(state!.publication.getImage(source) ?? []),
    })),
  };
}

export function cancelReaderPagination(input: { operationId: number; revisionId: number }): void {
  'worklet';
  cancelledOperations.add(input.operationId);
  if (
    state &&
    state.operationId === input.operationId &&
    state.revisionId === input.revisionId
  ) {
    state.publication.close();
    state = undefined;
  }
}

export function closeReaderPagination(): void {
  'worklet';
  state?.publication.close();
  state = undefined;
}

function collectTocTargets(
  entries: readonly import('../contracts').ReaderTocEntry[],
  resolve: (href: string) => number | undefined,
): readonly (readonly [string, number])[] {
  const targets: [string, number][] = [];
  const visit = (items: readonly import('../contracts').ReaderTocEntry[]) => {
    for (const item of items) {
      const spreadIndex = resolve(item.href);
      if (spreadIndex !== undefined) {
        targets.push([item.href, spreadIndex]);
        try {
          targets.push([decodeURIComponent(item.href), spreadIndex]);
        } catch {}
      }
      visit(item.children);
    }
  };
  visit(entries);
  return targets;
}

function createAbortError(): Error {
  const error = new Error('Reader pagination was cancelled.');
  error.name = 'AbortError';
  return error;
}

function createNativeMeasurementUnavailableError(): Error {
  const error = new Error(
    'Worker Runtime native text measurement is unavailable; local pagination is required.',
  );
  error.name = 'ReaderNativeWorkerUnavailableError';
  return error;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer as ArrayBuffer
    : bytes.slice().buffer as ArrayBuffer;
}

async function yieldToWorker(): Promise<void> {
  'worklet';
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
