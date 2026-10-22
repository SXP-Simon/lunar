import type { ReaderSessionEvent, ReaderSessionEventOf, ReaderSessionEventType } from '../domain/reader-session-events';

export interface ReaderSessionEventSource {
  on<T extends ReaderSessionEventType>(type: T, listener: (event: ReaderSessionEventOf<T>) => void): () => void;
  onAny(listener: (event: ReaderSessionEvent) => void): () => void;
}

type AnyListener = (event: ReaderSessionEvent) => void;

export class ReaderSessionEventBus implements ReaderSessionEventSource {
  private readonly listeners = new Set<AnyListener>();

  on<T extends ReaderSessionEventType>(type: T, listener: (event: ReaderSessionEventOf<T>) => void): () => void {
    return this.onAny((event) => {
      if (event.type === type) listener(event as ReaderSessionEventOf<T>);
    });
  }

  onAny(listener: AnyListener): () => void {
    // Wrap so that the same function can subscribe twice and unsubscribe independently.
    const entry: AnyListener = (event) => listener(event);
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  emit(event: ReaderSessionEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        // One failing listener must not starve the others; surface it outside the dispatch loop.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}
