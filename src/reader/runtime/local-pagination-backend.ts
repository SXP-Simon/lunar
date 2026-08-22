import type { ReaderPaginationBackend, ReaderPaginationBackendOpenOptions, ReaderPaginationBackendResult } from './pagination-backend';
import { ReaderPublicationLoader } from './publication-loader';
import type { ReaderRenderFrame } from '../contracts';
import type { ReaderPaginationProgressResponse } from './background-runtime-protocol';
import { LunarSkiaFontRegistry } from '../skia/fonts/font-registry';
import { LunarSkiaTextMeasurer } from '../skia/text/text-measurer';

export class LocalPaginationBackend implements ReaderPaginationBackend {
  private publication?: ReaderPaginationBackendResult['publication'];
  private activeOperation?: number;
  private activeRevision?: number;

  constructor(private readonly loader = new ReaderPublicationLoader()) {}

  async open(options: ReaderPaginationBackendOpenOptions): Promise<ReaderPaginationBackendResult> {
    await this.close();
    this.activeOperation = options.operationId;
    this.activeRevision = options.revisionId;
    const fontRegistry = options.fontRegistry ?? new LunarSkiaFontRegistry();
    const skiaFontRegistry = fontRegistry instanceof LunarSkiaFontRegistry
      ? fontRegistry
      : new LunarSkiaFontRegistry();
    const textMeasurer = options.textMeasurer ?? new LunarSkiaTextMeasurer(skiaFontRegistry);
    try {
      const publication = await this.loader.load({
        data: options.data,
        layout: options.layout,
        textMeasurer,
        fontRegistry,
        signal: options.signal,
        lineBreaking: 'greedy',
        onChapterPaginated: (timing) => {
          const response: ReaderPaginationProgressResponse = {
            type: 'progress',
            requestId: `${options.operationId}:${timing.chapterIndex}`,
            operationId: options.operationId,
            revisionId: options.revisionId,
            chapterIndex: timing.chapterIndex,
            chapterCount: timing.chapterIndex + 1,
          };
          options.onProgress?.(response);
        },
      });
      if (this.activeOperation !== options.operationId || this.activeRevision !== options.revisionId) {
        publication.close();
        throw createAbortError();
      }
      this.publication = publication;
      return { publication, operationId: options.operationId, revisionId: options.revisionId };
    } catch (error) {
      if (!options.textMeasurer && textMeasurer instanceof LunarSkiaTextMeasurer) {
        textMeasurer.dispose();
      }
      if (!options.fontRegistry) {
        fontRegistry.dispose?.();
      }
      throw error;
    }
  }

  async getFrame(revisionId: number, spreadIndex: number): Promise<ReaderRenderFrame | undefined> {
    if (revisionId !== this.activeRevision) {
      return undefined;
    }
    return this.publication?.getFrame(spreadIndex);
  }

  async cancel(operationId: number, revisionId: number): Promise<void> {
    if (this.activeOperation === operationId && this.activeRevision === revisionId) {
      this.activeOperation = undefined;
      this.activeRevision = undefined;
    }
  }

  async close(): Promise<void> {
    this.publication?.close();
    this.publication = undefined;
    this.activeOperation = undefined;
    this.activeRevision = undefined;
  }
}

function createAbortError(): Error {
  const error = new Error('Reader pagination was superseded.');
  error.name = 'AbortError';
  return error;
}
