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
  readonly measureText: boolean;
  readonly resolveFontMetrics: boolean;
  readonly available: boolean;
}

/**
 * Checks the module-owned JSI HostObject installed directly into this Worker.
 */
export function probeReaderWorkerNativeBridge(): ReaderWorkerNativeBridgeProbe {
  'worklet';
  const bridge = getReaderWorkerNativeBridge();
  const measureText = typeof bridge?.measureText === 'function';
  const resolveFontMetrics = typeof bridge?.resolveFontMetrics === 'function';
  return {
    measureText,
    resolveFontMetrics,
    available: measureText && resolveFontMetrics,
  };
}

export async function openReaderPagination(
  input: ReaderWorkletOpenRequest,
): Promise<ReaderWorkletOpenResult> {
  'worklet';
  const nativeBridge = getReaderWorkerNativeBridge();
  if (!input.allowApproximateMeasurement && !nativeBridge) {
    throw createNativeMeasurementUnavailableError();
  }
  const fontRegistry = new WorkletFontRegistry();
  const textMeasurer = new WorkletTextMeasurer(nativeBridge);
  const request: ReaderOpenRequest = input.request;
  cancelledOperations.delete(input.operationId);
  const layout = createRitoLayoutConfig(request);
  const context = await openRitoPaginationContext({
    data: input.data,
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
    // The reader forces its bundled font, so EPUB @font-face declarations do
    // not participate in Worker pagination.
  }
}

class WorkletTextMeasurer implements ReaderTextMeasurer {
  constructor(private readonly native?: ReaderWorkerNativeBridge) {}

  measureText(text: string, paint: ReaderMeasurePaint) {
    if (this.native) {
      return this.native.measureText(
        text,
        paint.font.sizePx,
        paint.letterSpacingPx ?? 0,
        paint.wordSpacingPx ?? 0,
      );
    }
    return {
      width:
        text.length * paint.font.sizePx * 0.55 +
        (paint.letterSpacingPx ?? 0) * Math.max(0, Array.from(text).length - 1) +
        (paint.wordSpacingPx ?? 0) * (text.match(/\s/g)?.length ?? 0),
      height: paint.font.sizePx,
    };
  }

  resolveFontMetrics(paint: ReaderMeasurePaint) {
    if (!this.native) {
      const size = paint.font.sizePx;
      return { ascentPx: size, descentPx: 0, lineGapPx: 0, contentHeightPx: size };
    }
    return this.native.resolveFontMetrics(paint.font.sizePx);
  }
}

interface ReaderWorkerNativeBridge {
  measureText(
    text: string,
    sizePx: number,
    letterSpacingPx: number,
    wordSpacingPx: number,
  ): { width: number; height: number };
  resolveFontMetrics(sizePx: number): {
    ascentPx: number;
    descentPx: number;
    lineGapPx: number;
    contentHeightPx: number;
  };
}

function getReaderWorkerNativeBridge(): ReaderWorkerNativeBridge | undefined {
  'worklet';
  return (globalThis as { __lunarPaginationWorker?: ReaderWorkerNativeBridge })
    .__lunarPaginationWorker;
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

async function yieldToWorker(): Promise<void> {
  'worklet';
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
