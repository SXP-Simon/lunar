export interface PaginationScheduler {
  yieldAfterChapter(signal?: AbortSignal): Promise<void>;
}

export class EventLoopPaginationScheduler implements PaginationScheduler {
  async yieldAfterChapter(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw createAbortError();
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    if (signal?.aborted) {
      throw createAbortError();
    }
  }
}

function createAbortError(): Error {
  const error = new Error('Pagination was aborted.');
  error.name = 'AbortError';
  return error;
}
