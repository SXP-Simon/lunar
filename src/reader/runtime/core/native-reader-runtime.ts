import type {
  ReaderLayoutRequest,
  ReaderOpenRequest,
  ReaderOpenResult,
  ReaderPosition,
  ReaderPublicationView,
  ReaderRenderFrame,
  ReaderSnapshot,
} from '../../contracts';
import { loadBundledLunarFontBytes } from '../../rito/pinned-font';
import { LunarSkiaFontRegistry } from '../../skia/fonts/font-registry';
import { SkiaImageCache } from '../../skia/images/image-decoder';
import {
  SkiaPictureCompiler,
  type CompiledReaderPicture,
} from '../../skia/rendering/picture-compiler';
import { LunarSkiaTextMeasurer } from '../../skia/text/text-measurer';
import { FrameCache } from '../cache/frame-cache';
import { ReaderImageByteCache } from '../cache/reader-image-cache';
import type { ReaderRuntime, ReaderSnapshotListener } from './reader-runtime';
import type { ReaderBackgroundPaginationBackend, ReaderPaginationBackend } from '../pagination/pagination-backend';
import { readerDiagnostic, readerPerformanceEnd, readerPerformanceMark, readerPerformanceStart } from './performance';

export type ReaderBookDataLoader = (request: ReaderOpenRequest) => Promise<ArrayBuffer>;

interface RetainedReaderPicture {
  readonly renderId: number;
  readonly compiled: CompiledReaderPicture;
  readonly imageLease: { release(): void };
  readonly sourceKey?: string;
  readonly renderKey?: string;
}

// A turn across a chapter boundary can visit several local spreads before it
// returns to the original chapter. Keep that neighborhood available for the
// common back-and-forth gesture while retaining a bounded native resource set.
const READER_PICTURE_CACHE_CAP = 12;

export class LunarReaderRuntime implements ReaderRuntime {
  private snapshot: ReaderSnapshot = {
    phase: 'idle',
    revisionId: 0,
    spreadIndex: 0,
  };
  private readonly listeners = new Set<ReaderSnapshotListener>();
  private readonly pictures = new FrameCache<RetainedReaderPicture>(
    READER_PICTURE_CACHE_CAP,
    (retained) => this.deferSkiaCleanup(() => {
      if (retained.renderKey && this.pictureRenderIdsByRenderKey.get(retained.renderKey) === retained.renderId) {
        this.pictureRenderIdsByRenderKey.delete(retained.renderKey);
      }
      for (const [slotKey, renderId] of this.pictureRenderIds) {
        if (renderId === retained.renderId) this.pictureRenderIds.delete(slotKey);
      }
      this.pictureCompiler.dispose(retained.compiled);
      retained.imageLease.release();
    }),
  );
  private readonly pictureCompiler = new SkiaPictureCompiler();
  private publication?: ReaderPublicationView;
  private fontRegistry?: LunarSkiaFontRegistry;
  private textMeasurer?: LunarSkiaTextMeasurer;
  private imageCache?: SkiaImageCache;
  private readonly imageByteCache = new ReaderImageByteCache();
  private readonly pictureRenderIds = new Map<string, number>();
  private readonly pictureRenderIdsByRenderKey = new Map<string, number>();
  private request?: ReaderOpenRequest;
  private data?: ArrayBuffer;
  private operation = 0;
  private abortController?: AbortController;
  private paginationComplete = false;
  private backgroundScheduled = false;
  private foregroundQueued = 0;
  private renderId = 0;
  /**
   * Foreground operations share one queue. Background work has its own lane;
   * the publication queue and native compare-and-swap checks keep its result
   * ordered with a turn while allowing a pending turn to take precedence.
   */
  private actionTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly loadData: ReaderBookDataLoader,
    private readonly paginationBackend: ReaderPaginationBackend,
  ) {}

  getSnapshot(): ReaderSnapshot {
    return this.snapshot;
  }

  subscribe(listener: ReaderSnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async open(request: ReaderOpenRequest): Promise<ReaderOpenResult> {
    const operation = this.beginOperation();
    const openStartedAt = readerPerformanceStart('reader.open');
    await this.releaseResources();
    this.request = request;
    this.emit({
      phase: 'opening',
      bookId: request.bookId,
      revisionId: this.snapshot.revisionId + 1,
      spreadIndex: 0,
    });

    try {
      const data = await this.loadData(request);
      readerPerformanceMark('reader.bookBytesReady', `bytes=${data.byteLength}`);
      this.assertCurrent(operation);
      this.data = data;
      return await this.loadCurrentRequest(
        request.restorePosition?.progression ?? 0,
        operation,
        'paginating',
      );
    } catch (error) {
      await this.fail(operation, error);
      throw error;
    }
    finally {
      readerPerformanceEnd('reader.open', openStartedAt);
    }
  }

  async updateLayout(request: ReaderLayoutRequest): Promise<ReaderSnapshot> {
    if (!this.request || !this.data) {
      throw new Error('A book must be open before updating its layout.');
    }
    const progression = this.snapshot.position?.progression ?? 0;
    const restorePosition = this.snapshot.position ?? this.request.restorePosition;
    const operation = this.beginOperation();
    this.request = { ...this.request, ...request, restorePosition };
    this.emit({
      ...this.snapshot,
      phase: 'reflowing',
      revisionId: this.snapshot.revisionId + 1,
      errorMessage: undefined,
    });
    await this.releaseResources();

    try {
      const result = await this.loadCurrentRequest(progression, operation, 'reflowing');
      return result.snapshot;
    } catch (error) {
      await this.fail(operation, error);
      throw error;
    }
  }

  async goToSpread(spreadIndex: number): Promise<ReaderSnapshot> {
    return this.enqueueNavigation(() => this.resolveSpreadTarget(spreadIndex));
  }

  async goToToc(href: string): Promise<ReaderSnapshot> {
    return this.enqueueAsyncNavigation(async () => {
      const target = await this.publication?.resolveToc(href);
      if (target === undefined) {
        throw new RangeError(`The table-of-contents target ${href} was not found.`);
      }
      this.invalidatePicture(target);
      return target;
    });
  }

  async next(): Promise<ReaderSnapshot> {
    return this.enqueueNavigation(() => {
      const allowed = this.publication?.canNavigate?.('next') !== false;
      const target = allowed
        ? this.publication?.getAdjacentSpreadIndex?.(this.snapshot.spreadIndex, 'next') ?? this.snapshot.spreadIndex + 1
        : this.snapshot.spreadIndex;
      readerDiagnostic('runtime.next', `allowed=${String(allowed)} from=${this.snapshot.spreadIndex} target=${target} snapshot=${describeSnapshot(this.snapshot)}`);
      return target;
    });
  }

  async previous(): Promise<ReaderSnapshot> {
    return this.enqueueNavigation(() => {
      const allowed = this.publication?.canNavigate?.('previous') !== false;
      const target = allowed
        ? this.publication?.getAdjacentSpreadIndex?.(this.snapshot.spreadIndex, 'previous') ?? this.snapshot.spreadIndex - 1
        : this.snapshot.spreadIndex;
      readerDiagnostic('runtime.previous', `allowed=${String(allowed)} from=${this.snapshot.spreadIndex} target=${target} snapshot=${describeSnapshot(this.snapshot)}`);
      return target;
    });
  }

  getCurrentPicture(
    revisionId = this.snapshot.revisionId,
    spreadIndex = this.snapshot.spreadIndex,
    renderId = this.pictureRenderIds.get(pictureSlotKey(revisionId, spreadIndex)),
  ): CompiledReaderPicture | undefined {
    if (renderId === undefined) return undefined;
    // A render identity may be assigned to more than one logical slot when
    // the same sealed picture is reused after a chapter-boundary turn. The
    // cache resolves by render identity, so the caller's current slot does
    // not need to match the slot where the Picture was first compiled.
    const retained = this.pictures.getByRenderId(revisionId, renderId);
    if (!retained) {
      readerDiagnostic('picture.miss', `revision=${revisionId} spread=${spreadIndex} renderId=${renderId} cacheEntries=${this.pictures.size}`);
      return undefined;
    }
    const frame = this.getCurrentFrame(spreadIndex);
    const frameRenderKey = frame ? pictureRenderKey(frame) : undefined;
    const retainedRenderKey = pictureRenderKey(retained);
    if (frameRenderKey && retainedRenderKey && frameRenderKey !== retainedRenderKey) {
      readerDiagnostic('picture.identity.reject', `revision=${revisionId} spread=${spreadIndex} renderId=${renderId} frameRenderKey=${frameRenderKey} pictureRenderKey=${retainedRenderKey}`);
      return undefined;
    }
    return retained?.compiled;
  }

  getCurrentFrame(spreadIndex = this.snapshot.spreadIndex): ReaderRenderFrame | undefined {
    return this.publication?.getFrame(spreadIndex);
  }

  getCurrentChapterTitle(): string | undefined {
    return this.publication?.getCurrentChapterTitle?.();
  }

  getCurrentHitMap(spreadIndex = this.snapshot.spreadIndex) {
    const frame = this.getCurrentFrame(spreadIndex);
    return frame?.hits ? { pageIndex: frame.pageIndices[0] ?? spreadIndex, entries: frame.hits } : undefined;
  }

  getCurrentSemantics(spreadIndex = this.snapshot.spreadIndex) {
    return this.getCurrentFrame(spreadIndex)?.semantics ?? [];
  }

  async resolveTextRangeGeometry(request: import('../../contracts').ReaderTextRangeGeometryRequest): Promise<readonly import('../../contracts').ReaderTextRangeRect[]> {
    const publication = this.publication;
    if (!publication?.resolveTextRangeGeometry || this.snapshot.phase !== 'ready') return [];
    const revision = this.snapshot.revisionId;
    const rects = await publication.resolveTextRangeGeometry(request);
    return revision === this.snapshot.revisionId ? rects : [];
  }

  async search(request: import('../../contracts').ReaderSearchRequest): Promise<import('../../contracts').ReaderSearchResponse> {
    const publication = this.publication;
    if (!publication?.search || this.snapshot.phase !== 'ready') {
      return { query: request.query, truncated: false, searchedPageCount: 0, scopeComplete: false, results: [] };
    }
    const revision = this.snapshot.revisionId;
    const response = await publication.search(request);
    return revision === this.snapshot.revisionId
      ? response
      : { query: request.query, truncated: false, searchedPageCount: 0, scopeComplete: false, results: [] };
  }

  getBackgroundColor(): string {
    return this.publication?.layout.palette.backgroundColor ?? '#000000';
  }

  async close(): Promise<void> {
    this.beginOperation();
    if (this.snapshot.phase !== 'idle') {
      this.emit({ ...this.snapshot, phase: 'closing' });
    }
    await this.releaseResources();
    this.data = undefined;
    this.request = undefined;
    this.emit({
      phase: 'idle',
      revisionId: this.snapshot.revisionId + 1,
      spreadIndex: 0,
    });
  }

  private async loadCurrentRequest(
    progression: number,
    operation: number,
    phase: 'paginating' | 'reflowing',
  ): Promise<ReaderOpenResult> {
    const request = this.request;
    const data = this.data;
    if (!request || !data) {
      throw new Error('The reader request is incomplete.');
    }

    const fontRegistry = new LunarSkiaFontRegistry();
    fontRegistry.loadBuiltinFont(await loadBundledLunarFontBytes());
    const textMeasurer = new LunarSkiaTextMeasurer(fontRegistry);
    this.fontRegistry = fontRegistry;
    this.textMeasurer = textMeasurer;
    this.emit({ ...this.snapshot, phase });

    const backendResult = await this.paginationBackend.open({
      data,
      layout: request,
      request,
      revisionId: this.snapshot.revisionId,
      operationId: operation,
      signal: this.abortController?.signal ?? new AbortController().signal,
      fontRegistry,
      textMeasurer,
      imageCache: this.imageByteCache,
    });
    const publication = backendResult.publication;
    this.assertCurrent(operation);
    this.publication = publication;
    this.paginationComplete = publication.totalSpreads !== undefined;
    this.imageCache ??= new SkiaImageCache({
      getBytes: (source) => publication.getImage(source),
    });

    const target = progressionToSpread(progression, publication.totalSpreads);
    await this.preparePicture(target, operation);
    this.assertCurrent(operation);
    const snapshot = this.createReadySnapshot(target);
    this.emit(snapshot);
    readerPerformanceMark('reader.firstReadySnapshot', `spread=${target}`);
    this.scheduleBackground(operation);
    return { metadata: publication.metadata, toc: publication.toc, snapshot };
  }

  private async showSpread(spreadIndex: number): Promise<ReaderSnapshot> {
    const publication = this.publication;
    if (!publication || this.snapshot.phase !== 'ready') {
      return this.snapshot;
    }
    const target = Math.max(0, Math.round(Number.isFinite(spreadIndex) ? spreadIndex : 0));
    const operation = this.operation;
    readerDiagnostic('runtime.show.begin', `requested=${spreadIndex} target=${target} snapshot=${describeSnapshot(this.snapshot)}`);
    try {
      await this.preparePicture(target, operation);
    } catch (error) {
      if (error instanceof RangeError) {
        readerDiagnostic('runtime.show.range', `target=${target} error=${describeError(error)}`);
        return this.snapshot;
      }
      readerDiagnostic('runtime.show.error', `target=${target} error=${describeError(error)}`);
      throw error;
    }
    this.assertCurrent(operation);
    const snapshot = this.createReadySnapshot(target);
    this.emit(snapshot);
    readerDiagnostic('runtime.show.ready', `target=${target} snapshot=${describeSnapshot(snapshot)}`);
    this.scheduleBackground(operation);
    return snapshot;
  }

  private enqueueNavigation(resolveTarget: () => number): Promise<ReaderSnapshot> {
    return this.enqueueForeground(() => this.showSpread(resolveTarget()));
  }

  private resolveSpreadTarget(requestedSpreadIndex: number): number {
    const requested = Math.round(Number.isFinite(requestedSpreadIndex) ? requestedSpreadIndex : 0);
    const currentBookSpread = this.snapshot.bookSpreadIndex;
    if (currentBookSpread === undefined) {
      return requested;
    }
    // Progress controls use the whole-book number, while the publication
    // keeps a render slot for the currently visible artifact. Translate the
    // requested page by relative distance so adjacent artifact navigation
    // remains the source of truth.
    return this.snapshot.spreadIndex + requested - currentBookSpread;
  }

  private enqueueAsyncNavigation(resolveTarget: () => Promise<number>): Promise<ReaderSnapshot> {
    return this.enqueueForeground(async () => this.showSpread(await resolveTarget()));
  }

  private enqueueForeground(action: () => Promise<ReaderSnapshot>): Promise<ReaderSnapshot> {
    this.foregroundQueued += 1;
    return this.enqueueAction(async () => {
      try {
        return await action();
      } finally {
        this.foregroundQueued -= 1;
        if (this.foregroundQueued === 0) this.scheduleBackground(this.operation);
      }
    });
  }

  private enqueueAction<T>(action: () => Promise<T>): Promise<T> {
    const run = this.actionTail.then(action, action);
    this.actionTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async advanceBackground(operation: number): Promise<void> {
    this.backgroundScheduled = false;
    const backend = this.paginationBackend as Partial<ReaderBackgroundPaginationBackend>;
    if (typeof backend.advanceBackground !== 'function') return;
    if (operation !== this.operation || this.abortController?.signal.aborted) return;
    if (this.foregroundQueued > 0) {
      readerDiagnostic('runtime.bg.pause', `operation=${operation} foregroundQueued=${this.foregroundQueued}`);
      return;
    }
    const quantumStartedAt = readerPerformanceStart('reader.background.quantum');
    let result: unknown;
    readerDiagnostic('runtime.bg.begin', `operation=${operation} snapshot=${describeSnapshot(this.snapshot)}`);
    try {
      result = await backend.advanceBackground(64);
    } catch (error) {
      readerPerformanceEnd('reader.background.quantum', quantumStartedAt);
      readerDiagnostic('runtime.bg.error', `operation=${operation} error=${describeError(error)}`);
      if (operation === this.operation && !this.abortController?.signal.aborted && isRetryableBackgroundError(error)) {
        this.scheduleBackground(operation);
        return;
      }
      throw error;
    }
    readerPerformanceEnd('reader.background.quantum', quantumStartedAt);
    readerDiagnostic('runtime.bg.result', `operation=${operation} result=${describeBackgroundResult(result)} snapshot=${describeSnapshot(this.snapshot)}`);
    if (operation !== this.operation || this.abortController?.signal.aborted) return;
    const totalSpreads = this.publication?.totalSpreads;
    if (totalSpreads !== this.snapshot.totalSpreads) {
      this.emit(this.createReadySnapshot(this.snapshot.spreadIndex));
    }
    if (isBackgroundComplete(result)) {
      this.paginationComplete = true;
      readerPerformanceMark('reader.background.complete', `totalSpreads=${this.publication?.totalSpreads ?? 'unknown'}`);
      if (this.snapshot.paginationComplete !== true) {
        this.emit(this.createReadySnapshot(this.snapshot.spreadIndex));
      }
      return;
    }
    if (this.foregroundQueued === 0) this.scheduleBackground(operation);
  }

  private scheduleBackground(operation: number): void {
    if (!this.publication || this.snapshot.phase !== 'ready' || this.backgroundScheduled || this.paginationComplete || this.foregroundQueued > 0 || operation !== this.operation || this.abortController?.signal.aborted) {
      return;
    }
    this.backgroundScheduled = true;
    readerDiagnostic('runtime.bg.schedule', `operation=${operation}`);
    setTimeout(() => {
      void this.advanceBackground(operation).catch(() => undefined);
    }, 32);
  }

  private async preparePicture(spreadIndex: number, operation: number): Promise<void> {
    const publication = this.publication;
    const imageCache = this.imageCache;
    const textMeasurer = this.textMeasurer;
    if (!publication || !imageCache || !textMeasurer) {
      throw new Error('The reader resources are unavailable.');
    }
    const revisionId = this.snapshot.revisionId;
    const slotKey = pictureSlotKey(revisionId, spreadIndex);
    const activeRenderId = this.pictureRenderIds.get(slotKey);
    let frame = await this.paginationBackend.getFrame(this.snapshot.revisionId, spreadIndex);
    frame ??= publication.getFrame(spreadIndex);
    if (!frame) {
      throw new RangeError(`Spread ${spreadIndex} is outside the publication.`);
    }
    const activePicture = activeRenderId === undefined
      ? undefined
      : this.pictures.get({ revisionId, spreadIndex, renderId: activeRenderId });
    if (activePicture) {
      if (pictureRenderKey(activePicture) === pictureRenderKey(frame)) return;
      this.invalidatePicture(spreadIndex);
    }
    const renderKey = frame.renderKey ?? frame.sourceKey;
    if (renderKey) {
      const cachedRenderId = this.pictureRenderIdsByRenderKey.get(renderKey);
      const cachedPicture = cachedRenderId === undefined
        ? undefined
        : this.pictures.getByRenderId(revisionId, cachedRenderId);
      if (cachedPicture && cachedRenderId !== undefined) {
        this.pictureRenderIds.set(slotKey, cachedRenderId);
        readerDiagnostic('picture.cache.hit', `spread=${spreadIndex} renderId=${cachedRenderId} renderKey=${renderKey}`);
        return;
      }
      this.pictureRenderIdsByRenderKey.delete(renderKey);
    }
    readerDiagnostic('picture.compile.begin', `spread=${spreadIndex} renderKey=${renderKey ?? 'none'} sourceKey=${frame.sourceKey ?? 'none'}`);
    const imageLease = await imageCache.acquire(frame.imageSources);
    try {
      this.assertCurrent(operation);
    } catch (error) {
      this.deferSkiaCleanup(() => imageLease.release());
      throw error;
    }
    const pictureStartedAt = readerPerformanceStart('reader.picture.compile');
    let picture: CompiledReaderPicture;
    try {
      picture = this.pictureCompiler.compile(frame.displayList, {
        pixelRatio: 1,
        images: imageCache,
        paragraphs: textMeasurer.paragraphs,
        colorOverride: {
          backgroundColor: publication.layout.palette.backgroundColor,
          foregroundColor: publication.layout.palette.foregroundColor,
        },
      });
    } catch (error) {
      this.deferSkiaCleanup(() => imageLease.release());
      throw error;
    } finally {
      readerPerformanceEnd('reader.picture.compile', pictureStartedAt);
    }
    this.renderId += 1;
    const renderId = this.renderId;
    this.pictures.set(
      { revisionId, spreadIndex, renderId },
      { renderId, compiled: picture, imageLease, sourceKey: frame.sourceKey, renderKey: frame.renderKey },
    );
    if (renderKey) this.pictureRenderIdsByRenderKey.set(renderKey, renderId);
    this.pictureRenderIds.set(slotKey, renderId);
    readerDiagnostic('picture.compile.done', `spread=${spreadIndex} renderId=${renderId} renderKey=${renderKey ?? 'none'}`);
  }

  private invalidatePicture(spreadIndex: number): void {
    const revisionId = this.snapshot.revisionId;
    const slotKey = pictureSlotKey(revisionId, spreadIndex);
    const renderId = this.pictureRenderIds.get(slotKey);
    if (renderId === undefined) return;
    // Touch the old entry before publishing its replacement so an in-flight
    // React Skia tree can keep resolving the previous render ID while the new
    // Picture is compiled. Cleanup remains deferred by the cache disposer.
    this.pictures.get({ revisionId, spreadIndex, renderId });
    this.pictureRenderIds.delete(slotKey);
  }

  /**
   * Skia may redraw a committed React tree after the runtime has emitted a
   * replacement snapshot. Delay native resource destruction until two frames
   * have completed so an evicted, non-current Picture is no longer referenced
   * by a committed Canvas tree.
   */
  private deferSkiaCleanup(cleanup: () => void): void {
    const run = () => {
      try {
        cleanup();
      } catch {
        // Resource cleanup is best effort after the owning frame is gone.
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(run));
      return;
    }
    setTimeout(() => setTimeout(run, 0), 0);
  }

  private createReadySnapshot(spreadIndex: number): ReaderSnapshot {
    const publication = this.publication;
    if (!publication) {
      throw new Error('The publication is unavailable.');
    }
    const frame = publication.getFrame(spreadIndex);
    const locator = publication.getCurrentLocator?.(spreadIndex);
    const bookPageIndex = publication.getBookPageIndex?.(spreadIndex);
    const bookSpreadIndex = bookPageIndex === undefined
      ? undefined
      : publication.layout.spreadMode === 'double'
        ? Math.floor(bookPageIndex / 2)
        : bookPageIndex;
    const position: ReaderPosition = {
      locator,
      progression:
        publication.totalSpreads === undefined || publication.totalSpreads <= 1 || bookSpreadIndex === undefined
          ? 0
          : bookSpreadIndex / (publication.totalSpreads - 1),
      pageIndex: frame?.pageIndices[0] ?? spreadIndex,
      spreadIndex,
      bookPageIndex,
      bookSpreadIndex,
      timestamp: Date.now(),
    };
    return {
      phase: 'ready',
      bookId: this.request?.bookId,
      revisionId: this.snapshot.revisionId,
      spreadIndex,
      renderId: this.pictureRenderIds.get(pictureSlotKey(this.snapshot.revisionId, spreadIndex)),
      bookSpreadIndex,
      chapterTitle: publication.getCurrentChapterTitle?.(),
      totalSpreads: bookSpreadIndex === undefined ? undefined : publication.totalSpreads,
      paginationComplete: this.paginationComplete,
      position,
    };
  }

  private beginOperation(): number {
    if (this.operation > 0) {
      void this.paginationBackend.cancel(this.operation, this.snapshot.revisionId);
    }
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.operation += 1;
    return this.operation;
  }

  private assertCurrent(operation: number): void {
    if (operation !== this.operation || this.abortController?.signal.aborted) {
      const error = new Error('The reader operation was superseded.');
      error.name = 'AbortError';
      throw error;
    }
  }

  private async fail(operation: number, error: unknown): Promise<void> {
    if (operation !== this.operation || (error instanceof Error && error.name === 'AbortError')) {
      return;
    }
    const diagnostic = error instanceof Error
      ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
      : error;
    console.error(
      '[LunarReaderRuntime] Reader operation failed.',
      diagnostic,
    );
    await this.releaseResources();
    this.emit({
      ...this.snapshot,
      phase: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  private async releaseResources(): Promise<void> {
    this.pictures.clear();
    this.pictureRenderIds.clear();
    this.pictureRenderIdsByRenderKey.clear();
    const imageCache = this.imageCache;
    if (imageCache) this.deferSkiaCleanup(() => imageCache.clear());
    this.imageCache = undefined;
    this.textMeasurer?.dispose();
    this.textMeasurer = undefined;
    this.publication = undefined;
    this.paginationComplete = false;
    this.backgroundScheduled = false;
    this.fontRegistry = undefined;
    await this.paginationBackend.close().catch(() => undefined);
    this.imageByteCache.clear();
  }

  private emit(snapshot: ReaderSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function describeSnapshot(snapshot: ReaderSnapshot): string {
  return `revision=${snapshot.revisionId} spread=${snapshot.spreadIndex} renderId=${snapshot.renderId ?? 'none'} bookSpread=${snapshot.bookSpreadIndex ?? 'none'} chapter=${snapshot.chapterTitle ?? 'none'} total=${snapshot.totalSpreads ?? 'none'} complete=${String(snapshot.paginationComplete)}`;
}

function describeBackgroundResult(result: unknown): string {
  if (typeof result !== 'object' || result === null) return String(result);
  const value = result as { readonly state?: unknown; readonly movesVisibleContent?: unknown; readonly artifact?: { readonly artifactId?: bigint; readonly revisionId?: bigint; readonly locator?: { readonly href?: string }; readonly localSpreadIndex?: number } };
  const artifact = value.artifact;
  return `state=${String(value.state ?? 'none')} moves=${String(value.movesVisibleContent ?? 'none')} artifact=${artifact ? `${artifact.artifactId?.toString() ?? 'none'}@${artifact.revisionId?.toString() ?? 'none'}:${artifact.locator?.href ?? 'none'}:${artifact.localSpreadIndex ?? 'none'}` : 'none'}`;
}

function describeError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error);
  const value = error as { readonly status?: unknown; readonly message?: unknown };
  return `status=${String(value.status ?? 'none')} message=${String(value.message ?? error)}`;
}

function pictureRenderKey(value: Pick<RetainedReaderPicture, 'renderKey' | 'sourceKey'> | Pick<ReaderRenderFrame, 'renderKey' | 'sourceKey'>): string | undefined {
  return value.renderKey ?? value.sourceKey;
}

function isRetryableBackgroundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  const status = (error as { readonly status?: unknown }).status;
  return status === 5 || status === 8;
}

function isBackgroundComplete(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('state' in value)) {
    return false;
  }
  const state = (value as { state?: unknown }).state;
  return state === 'complete' || state === 'terminal';
}

function progressionToSpread(progression: number, totalSpreads?: number): number {
  if (totalSpreads === undefined || totalSpreads <= 1) {
    return 0;
  }
  return clampSpread(Math.round(clampProgression(progression) * (totalSpreads - 1)), totalSpreads);
}

function clampProgression(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function clampSpread(value: number, totalSpreads: number): number {
  const upper = Math.max(0, totalSpreads - 1);
  return Math.min(upper, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

function pictureSlotKey(revisionId: number, spreadIndex: number): string {
  return `${revisionId}:${spreadIndex}`;
}
