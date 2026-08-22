export interface PaginationScheduler {
  /** Give React Native one frame to commit the loading surface before Rito starts. */
  yieldBeforePagination?(signal?: AbortSignal): Promise<void>;
  yieldAfterChapter(signal?: AbortSignal): Promise<void>;
}

export class EventLoopPaginationScheduler implements PaginationScheduler {
  async yieldBeforePagination(signal?: AbortSignal): Promise<void> {
    await yieldToHost(signal);
  }

  async yieldAfterChapter(signal?: AbortSignal): Promise<void> {
    await yieldToHost(signal);
  }
}

const HOST_IDLE_WINDOW_MS = 32;

function yieldToHost(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        reject(createAbortError());
      } else {
        resolve();
      }
    };
    const abort = () => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', abort);
      reject(createAbortError());
    };

    signal?.addEventListener('abort', abort, { once: true });
    // Keep a small input window between chapters. A zero-delay timer can be
    // consumed immediately by the pagination loop on slower devices.
    setTimeout(finish, HOST_IDLE_WINDOW_MS);
  });
}

function createAbortError(): Error {
  const error = new Error('Pagination was aborted.');
  error.name = 'AbortError';
  return error;
}
