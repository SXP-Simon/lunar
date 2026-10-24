import { describe, expect, it, vi } from 'vitest';
import type { ReaderSnapshot } from '@/reader';
import {
  closeReaderSessionObservation,
  observeReaderSession,
  type ReaderSessionEvent,
  type ReaderSessionObservation,
} from '../../src/features/reader/domain/reader-session-events';
import { ReaderSessionEventBus } from '../../src/features/reader/services/reader-session-event-bus';

function snapshot(patch: Partial<ReaderSnapshot> = {}): ReaderSnapshot {
  return {
    phase: 'ready',
    bookId: 'book',
    revisionId: 1,
    spreadIndex: 0,
    bookSpreadIndex: 4,
    totalSpreads: 100,
    chapterTitle: '第一章',
    position: {
      locator: { spineIdref: 'c1', manifestHref: 'c1.xhtml', chapterProgress: 0.1 },
      progression: 0.04,
      pageIndex: 0,
      spreadIndex: 0,
      timestamp: 1,
    },
    ...patch,
  };
}

function drive(...snapshots: ReaderSnapshot[]) {
  let observation: ReaderSessionObservation | undefined;
  const steps: ReaderSessionEvent['type'][][] = [];
  const events: ReaderSessionEvent[] = [];
  for (const next of snapshots) {
    const result = observeReaderSession(observation, next);
    observation = result.observation;
    steps.push(result.events.map((event) => event.type));
    events.push(...result.events);
  }
  return { observation, steps, events };
}

describe('reader session events', () => {
  it('reports one open and one ready across the opening phases', () => {
    const { steps, events, observation } = drive(
      { phase: 'idle', revisionId: 0, spreadIndex: 0 },
      snapshot({ phase: 'opening', position: undefined, totalSpreads: undefined }),
      snapshot({ phase: 'paginating', position: undefined, totalSpreads: undefined }),
      snapshot(),
    );
    expect(steps).toEqual([[], ['open'], [], ['ready']]);
    expect(events[1]).toMatchObject({
      type: 'ready',
      location: { chapter: { href: 'c1.xhtml', title: '第一章' }, progression: 0.04, page: 4, totalPages: 100 },
    });
    expect(observation?.lifecycle).toBe('open');
  });

  it('separates layout, chapter, location and pagination changes', () => {
    const turned = snapshot({ bookSpreadIndex: 5 });
    const nextChapter = snapshot({
      bookSpreadIndex: 6,
      chapterTitle: '第二章',
      position: { ...turned.position!, locator: { spineIdref: 'c2', manifestHref: 'c2.xhtml', chapterProgress: 0 } },
    });
    const { steps } = drive(
      snapshot({ phase: 'opening' }),
      snapshot(),
      turned,
      nextChapter,
      { ...nextChapter, paginationComplete: true },
      { ...nextChapter, phase: 'reflowing' },
      { ...nextChapter, revisionId: 2, paginationComplete: true },
    );
    expect(steps.slice(2)).toEqual([
      ['locationChange'],
      ['chapterChange', 'locationChange'],
      ['paginationChange'],
      [],
      ['layoutChange'],
    ]);
  });

  it('keeps the session open while reflowing and closes it on close or a different book', () => {
    const { steps } = drive(
      snapshot({ phase: 'opening' }),
      snapshot(),
      snapshot({ phase: 'reflowing' }),
      snapshot({ phase: 'opening', bookId: 'other' }),
      snapshot({ phase: 'closing', bookId: 'other' }),
    );
    expect(steps).toEqual([['open'], ['ready'], [], ['close', 'open'], ['close']]);
  });

  it('closes an observation that receives no further snapshots', () => {
    const { observation } = drive(snapshot({ phase: 'opening' }), snapshot());
    expect(closeReaderSessionObservation(observation)).toMatchObject({ type: 'close', bookId: 'book' });
    expect(closeReaderSessionObservation(undefined)).toBeUndefined();
  });

  it('isolates a failing listener from the others', async () => {
    vi.useFakeTimers();
    const bus = new ReaderSessionEventBus();
    const received: string[] = [];
    bus.on('open', () => {
      throw new Error('listener failure');
    });
    const unsubscribe = bus.on('open', (event) => received.push(event.bookId));
    const errors: unknown[] = [];
    const queue = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((task) => {
      try {
        task();
      } catch (error) {
        errors.push(error);
      }
    });
    bus.emit({ type: 'open', bookId: 'book' });
    unsubscribe();
    bus.emit({ type: 'open', bookId: 'again' });
    expect(received).toEqual(['book']);
    expect(errors).toHaveLength(2);
    queue.mockRestore();
    vi.useRealTimers();
  });
});
