import type {
  LoadedReaderPublication,
  ReaderLayoutRequest,
  ReaderOpenRequest,
  ReaderOpenResult,
  ReaderPosition,
  ReaderRenderFrame,
  ReaderSnapshot,
} from '../contracts';
import { LunarSkiaFontRegistry } from '../skia/font-registry';
import { SkiaImageCache } from '../skia/image-decoder';
import {
  SkiaPictureCompiler,
  type CompiledReaderPicture,
} from '../skia/picture-compiler';
import { LunarSkiaTextMeasurer } from '../skia/text-measurer';
import { FrameCache } from './frame-cache';
import { ReaderPublicationLoader } from './publication-loader';
import type { ReaderRuntime, ReaderSnapshotListener } from './reader-runtime';

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
  private publication?: LoadedReaderPublication;
  private fontRegistry?: LunarSkiaFontRegistry;
  private textMeasurer?: LunarSkiaTextMeasurer;
  private imageCache?: SkiaImageCache;
  private request?: ReaderOpenRequest;
  private data?: ArrayBuffer;
  private operation = 0;
  private abortController?: AbortController;

  constructor(
    private readonly loadData: ReaderBookDataLoader,
    private readonly publicationLoader = new ReaderPublicationLoader(),
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
    const textMeasurer = new LunarSkiaTextMeasurer(fontRegistry);
    this.fontRegistry = fontRegistry;
    this.textMeasurer = textMeasurer;
    this.emit({ ...this.snapshot, phase });

    const publication = await this.publicationLoader.load({
      data,
      layout: request,
      fontRegistry,
      textMeasurer,
      signal: this.abortController?.signal,
      lineBreaking: 'optimal',
    });
    this.assertCurrent(operation);
    this.publication = publication;
    this.imageCache = new SkiaImageCache({ getBytes: (source) => publication.getImage(source) });

    const target = progressionToSpread(progression, publication.totalSpreads);
    await this.preparePicture(target, operation);
    this.assertCurrent(operation);
    const snapshot = this.createReadySnapshot(target);
    this.emit(snapshot);
    void this.warmAdjacentPictures(target, operation);
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
    return snapshot;
  }

  private async preparePicture(spreadIndex: number, operation: number): Promise<void> {
    const publication = this.publication;
    const imageCache = this.imageCache;
    const fontRegistry = this.fontRegistry;
    if (!publication || !imageCache || !fontRegistry) {
      throw new Error('The reader resources are unavailable.');
    }
    const key = { revisionId: this.snapshot.revisionId, spreadIndex };
    if (this.pictures.get(key)) {
      return;
    }
    const frame = publication.getFrame(spreadIndex);
    if (!frame) {
      throw new RangeError(`Spread ${spreadIndex} is outside the publication.`);
    }
    await imageCache.preload(frame.imageSources);
    this.assertCurrent(operation);
    const picture = this.pictureCompiler.compile(frame.displayList, {
      pixelRatio: 1,
      images: imageCache,
      fonts: fontRegistry,
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
      position,
    };
  }

  private beginOperation(): number {
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
    this.publication?.close();
    this.publication = undefined;
    this.fontRegistry = undefined;
  }

  private emit(snapshot: ReaderSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
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
