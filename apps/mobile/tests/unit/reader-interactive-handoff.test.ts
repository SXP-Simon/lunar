import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderSnapshot } from '../../src/reader/contracts';
import type { LunarReaderRuntime, ReaderPreparedTurn } from '../../src/reader/runtime/core/native-reader-runtime';
import { ReaderPageTurnCoordinator } from '../../src/reader/skia/anime/controller/reader-page-turn-coordinator';
import { curlPageTurnEffect } from '../../src/reader/skia/anime/effects/curl/strategy';
import { slidePageTurnEffect } from '../../src/reader/skia/anime/effects/slide/strategy';
import type { PageTurnGestureValues } from '../../src/reader/skia/anime/gesture/use-page-turn-pan-gesture';
import {
  acknowledgeNativePagerPresentationById,
  consumeNativePagerInputById,
} from '../../src/reader/skia/anime/native/pager-compositor';

vi.mock('react-native-worklets', () => ({ runOnUI: (fn: (...args: unknown[]) => unknown) => fn }));
vi.mock('../../src/reader/skia/anime/native/pager-compositor', () => ({
  acknowledgeNativePagerPresentationById: vi.fn(),
  cancelNativePagerGestureOnUI: vi.fn(),
  consumeNativePagerInputById: vi.fn(() => true),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function page(index: number, complete = false): ReaderSnapshot {
  return {
    phase: 'ready', revisionId: 1, spreadIndex: index, renderId: index + 100, paginationComplete: complete,
  } as ReaderSnapshot;
}

function sharedValues(): PageTurnGestureValues {
  const shared = (value: unknown) => ({ value, set(next: unknown) { this.value = next; }, get() { return this.value; } });
  return Object.fromEntries([
    ['progress', 0], ['grabY', 0], ['heldRollTilt', 0], ['pressedEdgeX', 1], ['releasePending', false],
    ['nativeInputReady', false], ['nativePagerId', 0], ['nativeStockToken', 0], ['nativeStockDirection', 0],
    ['inputBlocked', false],
  ].map(([key, value]) => [key, shared(value)])) as unknown as PageTurnGestureValues;
}

function fixture({ complete = false, effect = slidePageTurnEffect } = {}) {
  let current = page(3, complete);
  let preparationId = 0;
  let held: ReaderPreparedTurn | undefined;
  let speculative = false;
  const listeners = new Set<(snapshot: ReaderSnapshot) => void>();
  const revoked = new Set<(id: number) => void>();
  const emit = (snapshot: ReaderSnapshot) => {
    current = snapshot;
    for (const listener of listeners) listener(snapshot);
  };
  const prepare = (direction: 'next' | 'previous'): ReaderPreparedTurn => {
    const step = direction === 'next' ? 1 : -1;
    held = {
      id: ++preparationId, revisionId: 1, direction,
      sourceSnapshotSpreadIndex: current.spreadIndex, sourcePreparedSpreadIndex: current.spreadIndex,
      targetSpreadIndex: current.spreadIndex + step, targetRenderId: current.renderId! + step,
    };
    return held;
  };
  const runtime = {
    getSnapshot: () => current,
    subscribe: (listener: (snapshot: ReaderSnapshot) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    subscribeSpeculationRevoked: (listener: (id: number) => void) => { revoked.add(listener); return () => revoked.delete(listener); },
    suspendBackgroundPagination: vi.fn(() => () => undefined),
    getCurrentPicture: (_revision: number, index: number) => ({ page: index }),
    getCurrentFrame: (index: number) => ({ page: index, width: 400, height: 800 }),
    getPreparedTargetSnapshot: (turn: ReaderPreparedTurn) =>
      ({ ...current, spreadIndex: turn.targetSpreadIndex, renderId: turn.targetRenderId, bookSpreadIndex: turn.targetSpreadIndex }),
    canNavigate: vi.fn(() => true),
    prepareAdjacent: vi.fn(async (direction: 'next' | 'previous') => {
      if (held && speculative && held.direction === direction) { speculative = false; return held; }
      return prepare(direction);
    }),
    speculateAdjacent: vi.fn(async (direction: 'next' | 'previous') => {
      if (held) return undefined;
      speculative = true;
      return prepare(direction);
    }),
    claimPreparedTurn: vi.fn((turn: ReaderPreparedTurn) => {
      if (held?.id !== turn.id) return false;
      speculative = false;
      return true;
    }),
    releasePreparedTurnToSpeculation: vi.fn((turn: ReaderPreparedTurn) => {
      if (held?.id !== turn.id || !current.paginationComplete) return false;
      speculative = true;
      return true;
    }),
    releaseSpeculation: vi.fn(async (turn: ReaderPreparedTurn) => {
      if (held?.id === turn.id && speculative) { held = undefined; speculative = false; }
    }),
    commitPreparedTurn: vi.fn(async (turn: ReaderPreparedTurn) => {
      held = undefined;
      emit({ ...current, spreadIndex: turn.targetSpreadIndex, renderId: turn.targetRenderId });
      return current;
    }),
    cancelPreparedTurn: vi.fn(async (turn: ReaderPreparedTurn) => { if (held?.id === turn.id) held = undefined; }),
    warmAdjacentPictures: vi.fn(async () => undefined),
    next: vi.fn(async () => {
      for (const listener of revoked) if (held && speculative) listener(held.id);
      emit({ ...current, spreadIndex: current.spreadIndex + 1, renderId: current.renderId! + 1 });
      return current;
    }),
    previous: vi.fn(async () => current),
  };
  const values = sharedValues();
  const coordinator = new ReaderPageTurnCoordinator(runtime as unknown as LunarReaderRuntime, values, {
    viewport: { width: 400, height: 800 }, pageTurnEffect: effect, spreadMode: 'single',
    animationDuration: 360, surfaceTop: 0,
  });
  coordinator.setSubscriberSnapshot(current);
  coordinator.attach();
  const state = () => coordinator.store.getState();
  async function drag(translationX = -150) {
    coordinator.beginDrag(350, 400);
    coordinator.updateDrag(translationX, 400, 4, 0);
    await vi.advanceTimersByTimeAsync(0);
  }
  const release = (sample = { throwVelocity: 4, throwAcceleration: 0, idleDecay: 1 }) =>
    coordinator.endDrag(-1600, -150, true, sample);
  const native = (token: number, prepared: number, event: 'consumed' | 'completed' | 'cancelled') =>
    coordinator.handleNativeEvent({ id: `lunar-interactive:${token}:${prepared}#turn:1`, event, direction: 1, eventAtMs: 0 });
  const render = (snapshot = current) => coordinator.setSubscriberSnapshot(snapshot);
  return { coordinator, runtime, values, state, drag, release, native, render, current: () => current };
}

describe('page turn coordinator handoff', () => {
  it('waits for the subscriber target before allowing another swipe, then preserves an older native tail', async () => {
    const { coordinator, runtime, state, drag, release, native, render, values } = fixture();
    await drag();
    expect(state().interactiveTurn?.source?.snapshot).toEqual(page(3));
    expect(state().interactiveTurn?.content?.key).toBe('1:4:104');
    const token = state().interactiveTurn!.nativeGesture!.token;
    coordinator.markNativeGestureAccepted(token);
    values.releasePending.set(true);
    release();
    expect(state().isSettling).toBe(true);
    native(token, 1, 'consumed');
    native(token, 1, 'consumed');
    await vi.advanceTimersByTimeAsync(0);
    render(page(3));
    expect(runtime.commitPreparedTurn).toHaveBeenCalledOnce();
    expect(state().isSettling).toBe(true);
    expect(values.releasePending.value).toBe(true);
    render(page(4));
    expect(state().isSettling).toBe(false);
    expect(values.releasePending.value).toBe(false);

    await drag();
    expect(state().interactiveTurn?.source?.snapshot).toEqual(page(4));
    expect(state().interactiveTurn?.content?.key).toBe('1:5:105');
    const nextToken = state().interactiveTurn!.nativeGesture!.token;
    native(token, 1, 'completed');
    await vi.advanceTimersByTimeAsync(0);
    expect(state().interactiveTurn?.nativeGesture?.token).toBe(nextToken);
    expect(acknowledgeNativePagerPresentationById).toHaveBeenCalledWith(0, 'lunar-interactive:1:1#turn:1');
    expect(runtime.commitPreparedTurn).toHaveBeenCalledOnce();
  });

  it('rejects a gesture while the subscriber still shows an older page than the runtime', async () => {
    const { runtime, drag, render, state } = fixture();
    render(page(2));
    await drag();
    expect(runtime.prepareAdjacent).not.toHaveBeenCalled();
    expect(state().interactiveTurn).toBeUndefined();
    render(page(3));
    await drag();
    expect(state().interactiveTurn?.source?.snapshot).toEqual(page(3));
    expect(runtime.prepareAdjacent).toHaveBeenCalledOnce();
  });

  it('holds the next page while idle and lets a swipe start from it without preparing', async () => {
    const { runtime, state, drag } = fixture({ complete: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(runtime.speculateAdjacent).toHaveBeenCalledWith('next');
    const stock = state().stock!;
    expect(stock.target.key).toBe('1:4:104');
    expect(stock.target.snapshot.bookSpreadIndex).toBe(4);

    await drag();
    expect(runtime.prepareAdjacent).not.toHaveBeenCalled();
    expect(runtime.claimPreparedTurn).toHaveBeenCalledOnce();
    expect(state().interactiveTurn?.content?.key).toBe('1:4:104');
    expect(state().interactiveTurn?.nativeGesture?.token).toBe(stock.token);
  });

  it('plays a tap from the stocked pair and resolves once the target reaches the subscriber', async () => {
    const { coordinator, runtime, state, native, render, values } = fixture({ complete: true });
    await vi.advanceTimersByTimeAsync(200);
    const stock = state().stock!;
    values.nativeInputReady.set(true);
    coordinator.markStocked(stock.token);
    expect(values.nativeStockToken.value).toBe(stock.token);

    const navigation = coordinator.next();
    expect(consumeNativePagerInputById).toHaveBeenCalledWith(0, 1);
    expect(runtime.next).not.toHaveBeenCalled();
    expect(state().interactiveTurn?.nativeGesture).toMatchObject({ driven: true, consumed: false });
    expect(values.nativeStockToken.value).toBe(0);

    native(stock.token, stock.preparedTurnId, 'consumed');
    native(stock.token, stock.preparedTurnId, 'completed');
    await expect(navigation).resolves.toMatchObject({ spreadIndex: 4 });
    render(page(4, true));
    await vi.advanceTimersByTimeAsync(40);
    expect(state().interactiveTurn).toBeUndefined();
    expect(acknowledgeNativePagerPresentationById).toHaveBeenCalled();
  });

  it('queues a second tap behind a consumed native sheet instead of waiting for its handoff', async () => {
    const { coordinator, runtime, state, native, values } = fixture({ complete: true, effect: curlPageTurnEffect });
    await vi.advanceTimersByTimeAsync(200);
    const stock = state().stock!;
    values.nativeInputReady.set(true);
    coordinator.markStocked(stock.token);
    void coordinator.next();
    native(stock.token, stock.preparedTurnId, 'consumed');
    native(stock.token, stock.preparedTurnId, 'completed');
    const second = coordinator.next();
    await vi.advanceTimersByTimeAsync(0);
    await expect(second).resolves.toMatchObject({ spreadIndex: 5 });
    expect(runtime.commitPreparedTurn).toHaveBeenCalledOnce();
    expect(runtime.next).toHaveBeenCalledOnce();
    // The first sheet's target never shows as a still page; its presentation
    // is released when the next turn takes over.
    expect(acknowledgeNativePagerPresentationById).toHaveBeenCalledWith(0, `lunar-interactive:${stock.token}:${stock.preparedTurnId}#turn:1`);
    expect(state().interactiveTurn).toBeUndefined();
    expect(state().automaticTurns).toHaveLength(1);
  });

  it('runs a tap made during a settling turn after the turn hands off', async () => {
    const { coordinator, runtime, state, drag, release, native, render } = fixture();
    await drag();
    const token = state().interactiveTurn!.nativeGesture!.token;
    coordinator.markNativeGestureAccepted(token);
    release();
    const tap = coordinator.next();
    expect(runtime.next).not.toHaveBeenCalled();
    native(token, 1, 'consumed');
    native(token, 1, 'completed');
    await vi.advanceTimersByTimeAsync(0);
    render(page(4));
    await vi.advanceTimersByTimeAsync(40);
    await expect(tap).resolves.toMatchObject({ spreadIndex: 5 });
    expect(runtime.next).toHaveBeenCalledOnce();
  });

  it('leaves the page in place at either end of the book', async () => {
    const { runtime, state, drag } = fixture();
    runtime.canNavigate.mockReturnValue(false);
    await drag();
    expect(runtime.prepareAdjacent).not.toHaveBeenCalled();
    expect(state().interactiveTurn).toBeUndefined();
  });

  it('publishes an automatic turn in the same tick as its target snapshot', async () => {
    const { coordinator, runtime, state } = fixture({ effect: curlPageTurnEffect });
    let turnsAtEmit = -1;
    runtime.subscribe(() => { turnsAtEmit = state().automaticTurns.length; });
    const navigation = coordinator.next();
    await vi.advanceTimersByTimeAsync(0);
    await navigation;
    expect(turnsAtEmit).toBe(1);
    expect(state().automaticTurns[0]).toMatchObject({ direction: 1, burst: false });
  });

  it('returns a cancelled swipe to the idle candidate instead of preparing again', async () => {
    const { runtime, state, drag, coordinator } = fixture({ complete: true });
    await vi.advanceTimersByTimeAsync(200);
    await drag(-40);
    coordinator.endDrag(0, -40, false, { throwVelocity: 0, throwAcceleration: 0, idleDecay: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state().interactiveTurn).toBeUndefined();
    expect(runtime.releasePreparedTurnToSpeculation).toHaveBeenCalledOnce();
    expect(runtime.cancelPreparedTurn).not.toHaveBeenCalled();
    expect(state().stock?.preparedTurnId).toBe(1);
    await drag();
    expect(runtime.prepareAdjacent).not.toHaveBeenCalled();
    expect(runtime.speculateAdjacent).toHaveBeenCalledOnce();
  });
});
