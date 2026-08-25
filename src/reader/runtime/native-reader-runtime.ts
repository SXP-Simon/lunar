import type {
  LoadedReaderPublication,
  ReaderLayoutRequest,
  ReaderOpenRequest,
  ReaderOpenResult,
  ReaderPosition,
  ReaderPublicationView,
  ReaderRenderFrame,
  ReaderSnapshot,
} from '../contracts';
import { readNativeReaderBuiltinFont } from '../native/archive-module';
import { LunarSkiaFontRegistry } from '../skia/fonts/font-registry';
import { SkiaImageCache } from '../skia/images/image-decoder';
import {
  SkiaPictureCompiler,
  type CompiledReaderPicture,
} from '../skia/rendering/picture-compiler';
import { LunarSkiaTextMeasurer } from '../skia/text/text-measurer';
import { LUNAR_READER_FONT_FAMILY } from '../typography';
import { FrameCache } from './frame-cache';
import { ReaderPublicationLoader } from './publication-loader';
import type { ReaderRuntime, ReaderSnapshotListener } from './reader-runtime';
import type { ReaderBackgroundPaginationBackend, ReaderPaginationBackend } from './pagination-backend';
import { LocalPaginationBackend } from './local-pagination-backend';
import { createReaderLayoutFingerprint } from './background-runtime-protocol';
import { RITO_VERSION } from '../rito';

export type ReaderBookDataLoader = (request: ReaderOpenRequest) => Promise<ArrayBuffer>;

export class LunarReaderRuntime implements ReaderRuntime {
  private snapshot: ReaderSnapshot = {
    phase: 'idle',
    revisionId: 0,
    spreadIndex: 0,
  };
  private readonly listeners = new Set<ReaderSnapshotListener>();
  private readonly pictures = new FrameCache<CompiledReaderPicture>(
    3,
    (picture) => this.pictureCompiler.dispose(picture),
  );
  private readonly pictureCompiler = new SkiaPictureCompiler();
  private publication?: ReaderPublicationView;
  private publicationOwner?: LoadedReaderPublication;
  private fontRegistry?: LunarSkiaFontRegistry;
  private textMeasurer?: LunarSkiaTextMeasurer;
  private imageCache?: SkiaImageCache;
  private request?: ReaderOpenRequest;
  private data?: ArrayBuffer;
  private operation = 0;
  private abortController?: AbortController;
  private paginationComplete = false;

  constructor(
    private readonly loadData: ReaderBookDataLoader,
    private readonly publicationLoader = new ReaderPublicationLoader(),
    private readonly paginationBackend: ReaderPaginationBackend = new LocalPaginationBackend(publicationLoader),
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
    this.releaseResources();
    this.request = request;
    this.emit({
      phase: 'opening',
      bookId: request.bookId,
      revisionId: this.snapshot.revisionId + 1,
      spreadIndex: 0,
    });

    try {
      const data = await this.loadData(request);
      this.assertCurrent(operation);
      this.data = data;
      return await this.loadCurrentRequest(
        request.restorePosition?.progression ?? 0,
        operation,
        'paginating',
      );
    } catch (error) {
      this.fail(operation, error);
      throw error;
    }
  }

  async updateLayout(request: ReaderLayoutRequest): Promise<ReaderSnapshot> {
    if (!this.request || !this.data) {
      throw new Error('A book must be open before updating its layout.');
    }
    const progression = this.snapshot.position?.progression ?? 0;
    const operation = this.beginOperation();
    this.request = { ...this.request, ...request };
    this.emit({
      ...this.snapshot,
      phase: 'reflowing',
      revisionId: this.snapshot.revisionId + 1,
      errorMessage: undefined,
    });
    this.releaseResources();

    try {
      const result = await this.loadCurrentRequest(progression, operation, 'reflowing');
      return result.snapshot;
    } catch (error) {
      this.fail(operation, error);
      throw error;
    }
  }

  async goToSpread(spreadIndex: number): Promise<ReaderSnapshot> {
    return this.showSpread(spreadIndex);
  }

  async goToToc(href: string): Promise<ReaderSnapshot> {
    const target = this.publication?.resolveToc(href);
    if (target === undefined) {
      throw new RangeError(`The table-of-contents target ${href} was not found.`);
    }
    return this.showSpread(target);
  }

  async next(): Promise<ReaderSnapshot> {
    return this.showSpread(this.snapshot.spreadIndex + 1);
  }

  async previous(): Promise<ReaderSnapshot> {
    return this.showSpread(this.snapshot.spreadIndex - 1);
  }

  getCurrentPicture(
    revisionId = this.snapshot.revisionId,
    spreadIndex = this.snapshot.spreadIndex,
  ): CompiledReaderPicture | undefined {
    return this.pictures.get({ revisionId, spreadIndex });
  }

  getCurrentFrame(spreadIndex = this.snapshot.spreadIndex): ReaderRenderFrame | undefined {
    return this.publication?.getFrame(spreadIndex);
  }

  getCurrentHitMap(spreadIndex = this.snapshot.spreadIndex) {
    const frame = this.getCurrentFrame(spreadIndex);
    return frame?.hits ? { pageIndex: frame.pageIndices[0] ?? spreadIndex, entries: frame.hits } : undefined;
  }

  getCurrentSemantics(spreadIndex = this.snapshot.spreadIndex) {
    return this.getCurrentFrame(spreadIndex)?.semantics ?? [];
  }

  getBackgroundColor(): string {
    return this.publication?.layout.palette.backgroundColor ?? '#000000';
  }

  async close(): Promise<void> {
    this.beginOperation();
    if (this.snapshot.phase !== 'idle') {
      this.emit({ ...this.snapshot, phase: 'closing' });
    }
    this.releaseResources();
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
    fontRegistry.loadBuiltinFont(readNativeReaderBuiltinFont());
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
      cacheKey: createReaderLayoutFingerprint({
        bookHash: request.bookId,
        ritoVersion: RITO_VERSION,
        rendererVersion: 'react-native-skia-2.6.2',
        layout: request,
        fontFingerprint: LUNAR_READER_FONT_FAMILY,
      }),
      signal: this.abortController?.signal ?? new AbortController().signal,
      fontRegistry,
      textMeasurer,
    });
    const publication = backendResult.publication;
    this.assertCurrent(operation);
    this.publication = publication;
    this.publicationOwner = publication;
    this.paginationComplete = true;
    this.imageCache ??= new SkiaImageCache({
      getBytes: (source) => publication.getImage(source),
    });

    const target = progressionToSpread(progression, publication.totalSpreads);
    await this.preparePicture(target, operation);
    this.assertCurrent(operation);
    const snapshot = this.createReadySnapshot(target);
    this.emit(snapshot);
    void this.warmAdjacentPictures(target, operation);
    void this.advanceBackground(operation);
    return { metadata: publication.metadata, toc: publication.toc, snapshot };
  }

  private async showSpread(spreadIndex: number): Promise<ReaderSnapshot> {
    const publication = this.publication;
    if (!publication || this.snapshot.phase !== 'ready') {
      return this.snapshot;
    }
    const target = clampSpread(spreadIndex, publication.totalSpreads);
    const operation = this.operation;
    await this.preparePicture(target, operation);
    this.assertCurrent(operation);
    const snapshot = this.createReadySnapshot(target);
    this.emit(snapshot);
    void this.warmAdjacentPictures(target, operation);
    void this.advanceBackground(operation);
    return snapshot;
  }

  private async advanceBackground(operation: number): Promise<void> {
    const backend = this.paginationBackend as Partial<ReaderBackgroundPaginationBackend>;
    if (typeof backend.advanceBackground !== 'function') {
      return;
    }
    for (let quantum = 0; quantum < 32 && operation === this.operation; quantum += 1) {
      const result = await backend.advanceBackground(64);
      if (operation !== this.operation || this.abortController?.signal.aborted) {
        return;
      }
      if (isBackgroundComplete(result)) {
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  private async preparePicture(spreadIndex: number, operation: number): Promise<void> {
    const publication = this.publication;
    const imageCache = this.imageCache;
    const textMeasurer = this.textMeasurer;
    if (!publication || !imageCache || !textMeasurer) {
      throw new Error('The reader resources are unavailable.');
    }
    const key = { revisionId: this.snapshot.revisionId, spreadIndex };
    if (this.pictures.get(key)) {
      return;
    }
    let frame = publication.getFrame(spreadIndex);
    if (!frame) {
      frame = await this.paginationBackend.getFrame(this.snapshot.revisionId, spreadIndex);
    }
    if (!frame) {
      throw new RangeError(`Spread ${spreadIndex} is outside the publication.`);
    }
    await imageCache.preload(frame.imageSources);
    this.assertCurrent(operation);
    const picture = this.pictureCompiler.compile(frame.displayList, {
      pixelRatio: 1,
      images: imageCache,
      paragraphs: textMeasurer.paragraphs,
    });
    this.pictures.set(key, picture);
  }

  private async warmAdjacentPictures(spreadIndex: number, operation: number): Promise<void> {
    const total = this.publication?.totalSpreads ?? 0;
    for (const target of [spreadIndex - 1, spreadIndex + 1]) {
      if (target < 0 || target >= total || operation !== this.operation) {
        continue;
      }
      try {
        await this.preparePicture(target, operation);
      } catch {
        return;
      }
    }
  }

  private createReadySnapshot(spreadIndex: number): ReaderSnapshot {
    const publication = this.publication;
    if (!publication) {
      throw new Error('The publication is unavailable.');
    }
    const frame = publication.getFrame(spreadIndex);
    const position: ReaderPosition = {
      progression:
        publication.totalSpreads <= 1 ? 0 : spreadIndex / (publication.totalSpreads - 1),
      pageIndex: frame?.pageIndices[0] ?? spreadIndex,
      spreadIndex,
      timestamp: Date.now(),
    };
    return {
      phase: 'ready',
      bookId: this.request?.bookId,
      revisionId: this.snapshot.revisionId,
      spreadIndex,
      totalSpreads: publication.totalSpreads,
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

  private fail(operation: number, error: unknown): void {
    if (operation !== this.operation || (error instanceof Error && error.name === 'AbortError')) {
      return;
    }
    console.error(
      '[LunarReaderRuntime] Reader operation failed.',
      error instanceof Error ? error.stack ?? error.message : error,
      error instanceof Error && 'details' in error ? error.details : undefined,
    );
    this.releaseResources();
    this.emit({
      ...this.snapshot,
      phase: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  private releaseResources(): void {
    this.pictures.clear();
    this.imageCache?.clear();
    this.imageCache = undefined;
    this.textMeasurer?.dispose();
    this.textMeasurer = undefined;
    this.publicationOwner?.close();
    this.publicationOwner = undefined;
    this.publication = undefined;
    this.paginationComplete = false;
    this.fontRegistry = undefined;
    void this.paginationBackend.close();
  }

  private emit(snapshot: ReaderSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function isBackgroundComplete(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('state' in value)) {
    return false;
  }
  const state = (value as { state?: unknown }).state;
  return state === 'complete' || state === 'terminal';
}

function progressionToSpread(progression: number, totalSpreads: number): number {
  if (totalSpreads <= 1) {
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
