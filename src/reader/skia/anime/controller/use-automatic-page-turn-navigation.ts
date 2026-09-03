import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReaderSnapshot } from '../../../contracts';
import type { LunarReaderRuntime } from '../../../runtime/core/native-reader-runtime';
import {
  AUTOMATIC_PAGE_TURN_MAX_LANES,
  AUTOMATIC_PAGE_TURN_START_INTERVAL_MS,
  appendAutomaticPageTurn,
} from '../core/page-turn-concurrency';
import {
  readerPageContentForSnapshot,
  sameSnapshotIdentity,
} from '../core/page-content';
import type { ReaderAutomaticTurn, ReaderPageAnimationStyle } from '../core/page-turn-types';
import { resolveReaderPageAnimationStyle } from '../core/page-turn-timing';

interface AutomaticPageTurnNavigationOptions {
  readonly animationStyle: ReaderPageAnimationStyle;
  readonly beforeNavigate: () => Promise<void>;
  readonly runtime: LunarReaderRuntime;
}

interface AutomaticPageTurnNavigation {
  readonly active: boolean;
  readonly turns: readonly ReaderAutomaticTurn[];
  readonly complete: (turnId: number) => void;
  readonly next: () => Promise<ReaderSnapshot>;
  readonly previous: () => Promise<ReaderSnapshot>;
}

export function useAutomaticPageTurnNavigation({
  animationStyle,
  beforeNavigate,
  runtime,
}: AutomaticPageTurnNavigationOptions): AutomaticPageTurnNavigation {
  const generation = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextStartAt = useRef(0);
  const direction = useRef<1 | -1 | undefined>(undefined);
  const pendingCount = useRef(0);
  const turnsRef = useRef<readonly ReaderAutomaticTurn[]>([]);
  const turnSequence = useRef(0);
  const controllerRuntime = useRef(runtime);
  const [turns, setTurns] = useState<readonly ReaderAutomaticTurn[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);

  const complete = useCallback((turnId: number) => {
    const nextTurns = turnsRef.current.filter((turn) => turn.id !== turnId);
    if (nextTurns.length === turnsRef.current.length) return;
    turnsRef.current = nextTurns;
    setTurns(nextTurns);
    if (nextTurns.length === 0 && pendingCount.current === 0) {
      direction.current = undefined;
    }
  }, []);

  const enqueue = useCallback((turnDirection: 1 | -1) => {
    const paperAnimation = resolveReaderPageAnimationStyle(animationStyle) === 'page';
    if (pendingCount.current + turnsRef.current.length >= AUTOMATIC_PAGE_TURN_MAX_LANES) {
      return Promise.resolve(runtime.getSnapshot());
    }
    if (paperAnimation) {
      if (direction.current !== undefined && direction.current !== turnDirection) {
        return Promise.resolve(runtime.getSnapshot());
      }
      direction.current = turnDirection;
    }
    pendingCount.current += 1;
    setPendingRequests(pendingCount.current);
    const requestGeneration = generation.current;
    return new Promise<ReaderSnapshot>((resolve, reject) => {
      const run = async () => {
        try {
          if (generation.current !== requestGeneration) {
            resolve(runtime.getSnapshot());
            return;
          }
          if (paperAnimation) {
            const startDelay = Math.max(0, nextStartAt.current - Date.now());
            if (startDelay > 0) await waitForPageTurn(startDelay);
            if (generation.current !== requestGeneration) {
              resolve(runtime.getSnapshot());
              return;
            }
          }
          await beforeNavigate();
          const before = runtime.getSnapshot();
          const from = readerPageContentForSnapshot(runtime, before);
          const result = turnDirection > 0 ? await runtime.next() : await runtime.previous();
          if (
            generation.current === requestGeneration
            && from
            && !sameSnapshotIdentity(before, result)
          ) {
            const to = readerPageContentForSnapshot(runtime, result);
            if (to) {
              const turn: ReaderAutomaticTurn = {
                id: ++turnSequence.current,
                from,
                to,
                direction: turnDirection,
              };
              const nextTurns = appendAutomaticPageTurn(turnsRef.current, turn);
              turnsRef.current = nextTurns;
              setTurns(nextTurns);
              if (paperAnimation) {
                nextStartAt.current = Date.now() + AUTOMATIC_PAGE_TURN_START_INTERVAL_MS;
              }
            }
          }
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          pendingCount.current = Math.max(0, pendingCount.current - 1);
          setPendingRequests(pendingCount.current);
          if (pendingCount.current === 0 && turnsRef.current.length === 0) {
            direction.current = undefined;
          }
        }
      };
      queue.current = queue.current.then(run, run);
    });
  }, [animationStyle, beforeNavigate, runtime]);

  const next = useCallback(() => enqueue(1), [enqueue]);
  const previous = useCallback(() => enqueue(-1), [enqueue]);

  useEffect(() => {
    const runtimeChanged = controllerRuntime.current !== runtime;
    controllerRuntime.current = runtime;
    generation.current += 1;
    queue.current = Promise.resolve();
    nextStartAt.current = 0;
    direction.current = undefined;
    pendingCount.current = 0;
    turnsRef.current = [];
    if (runtimeChanged) {
      void Promise.resolve().then(() => {
        if (controllerRuntime.current !== runtime) return;
        setPendingRequests(0);
        setTurns([]);
      });
    }
    return () => {
      generation.current += 1;
    };
  }, [runtime]);

  return {
    active: pendingRequests > 0 || turns.length > 0,
    turns,
    complete,
    next,
    previous,
  };
}

function waitForPageTurn(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
