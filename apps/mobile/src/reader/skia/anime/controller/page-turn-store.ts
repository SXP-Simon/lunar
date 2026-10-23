import { useCallback, useRef, useSyncExternalStore } from 'react';

import type { ReaderAutomaticTurn, ReaderInteractiveTurn, ReaderPageContent } from '../core/page-turn-types';

/** A prepared pair the native composer should hold for the next input. */
export interface ReaderPageTurnStock {
  readonly token: number;
  readonly preparedTurnId: number;
  readonly direction: 1 | -1;
  readonly source: ReaderPageContent;
  readonly target: ReaderPageContent;
  readonly performanceId?: string;
}

export interface ReaderPageTurnState {
  readonly interactiveTurn?: ReaderInteractiveTurn;
  readonly automaticTurns: readonly ReaderAutomaticTurn[];
  /** Automatic requests are queued or their turns are still animating. */
  readonly automaticNavigationActive: boolean;
  /** An input turn is settling or waiting for its target to reach the subscriber. */
  readonly isSettling: boolean;
  readonly stock?: ReaderPageTurnStock;
  /** Bumped when the native composer lost track of the visible page and must re-anchor. */
  readonly nativeResetEpoch: number;
}

export const INITIAL_PAGE_TURN_STATE: ReaderPageTurnState = {
  automaticTurns: [],
  automaticNavigationActive: false,
  isSettling: false,
  nativeResetEpoch: 0,
};

/**
 * Page-turn state lives outside React so that only the components drawing a
 * turn re-render while it moves. The reader screen subscribes to the coarse
 * flags it gates interaction on; the surface subscribes to the turns.
 */
export class ReaderPageTurnStore {
  private state: ReaderPageTurnState = INITIAL_PAGE_TURN_STATE;
  private readonly listeners = new Set<() => void>();

  readonly getState = (): ReaderPageTurnState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setState(next: ReaderPageTurnState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

/** Subscribes to one slice of the page-turn state; equal slices skip the render. */
export function usePageTurnState<T>(
  store: ReaderPageTurnStore,
  select: (state: ReaderPageTurnState) => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
): T {
  const cache = useRef<{ readonly state: ReaderPageTurnState; readonly value: T } | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const cached = cache.current;
    if (cached?.state === state) return cached.value;
    const value = select(state);
    if (cached && isEqual(cached.value, value)) {
      cache.current = { state, value: cached.value };
      return cached.value;
    }
    cache.current = { state, value };
    return value;
  }, [isEqual, select, store]);
  return useSyncExternalStore(store.subscribe, getSnapshot);
}
