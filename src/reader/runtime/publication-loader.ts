import type {
  LoadedReaderPublication,
  LoadReaderPublicationOptions,
  ReaderChapterTiming,
  ReaderImageDecoder,
  ReaderImageDimensions,
} from '../contracts';
import { LunarReaderError, READER_ERROR_CODES } from '../contracts';
import {
  createRitoDisplayListOptions,
  createRitoLayoutConfig,
  openRitoPaginationContext,
  toReaderLayoutParameters,
  type RitoPaginationContext,
} from '../rito';
import {
  EventLoopPaginationScheduler,
  type PaginationScheduler,
} from './pagination-scheduler';
import { encodedImageDimensionDecoder } from './image-dimension-decoder';

export class ReaderPublicationLoader {
  constructor(
    private readonly scheduler: PaginationScheduler = new EventLoopPaginationScheduler(),
  ) {}

  async load<TImage extends ReaderImageDimensions>(
    options: LoadReaderPublicationOptions<TImage>,
  ): Promise<LoadedReaderPublication> {
    let context: RitoPaginationContext | undefined;

    try {
      throwIfAborted(options.signal);
      const layout = createRitoLayoutConfig(options.layout);
      await this.scheduler.yieldBeforePagination?.(options.signal);
      throwIfAborted(options.signal);
      context = await openRitoPaginationContext({
        data: options.data,
        layout,
        layoutParameters: toReaderLayoutParameters(layout, options.layout),
        displayListOptions: createRitoDisplayListOptions(options.layout),
        textMeasurer: options.textMeasurer,
        fontRegistry: options.fontRegistry,
        imageDecoder:
          options.imageDecoder ??
          (encodedImageDimensionDecoder as ReaderImageDecoder<TImage>),
        imageDecodeConcurrency: options.imageDecodeConcurrency,
        lineBreaking: options.lineBreaking,
      });

      const timings: ReaderChapterTiming[] = [];
      let done = false;
      let chapterIndex = 0;
      while (!done) {
        throwIfAborted(options.signal);
        if (chapterIndex === 0) {
          await this.scheduler.yieldBeforePagination?.(options.signal);
          throwIfAborted(options.signal);
        }
        const startedAt = performance.now();
        const chapter = context.paginateNextChapter();
        const timing: ReaderChapterTiming = {
          chapterIndex,
          pageCount: chapter.pageCount,
          durationMs: performance.now() - startedAt,
        };
        timings.push(timing);
        options.onChapterPaginated?.(timing);
        done = chapter.done;
        chapterIndex += 1;

        if (!done) {
          await this.scheduler.yieldAfterChapter(options.signal);
        }
      }

      return context.buildPublication(timings);
    } catch (error) {
      context?.close();
      if (isAbortError(error) || error instanceof LunarReaderError) {
        throw error;
      }

      throw new LunarReaderError(
        context ? READER_ERROR_CODES.paginationFailed : READER_ERROR_CODES.invalidEpub,
        context ? 'Rito could not paginate the EPUB.' : 'Rito could not open the EPUB.',
        { cause: getErrorMessage(error) },
      );
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error('Publication loading was aborted.');
  error.name = 'AbortError';
  throw error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
