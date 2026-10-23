import type { ReaderAutomaticTurn, ReaderPageTransitionState } from './page-turn-types';

export const AUTOMATIC_PAGE_TURN_START_INTERVAL_MS = 100;
export const AUTOMATIC_PAGE_TURN_MAX_LANES = 10;
/** Visual lifetime of each sheet while taps overlap. */
export const AUTOMATIC_PAGE_TURN_BURST_DURATION_MS = 160;
const AUTOMATIC_PAGE_TURN_BURST_MAX_SPEEDUP = 8;

/**
 * Overlapping taps play faster so a burst keeps pace with the finger instead
 * of stacking full-length sheets; a lone turn keeps its own duration.
 */
export function burstPageTurnDurationMs(durationMs: number, burst: boolean | undefined): number {
  if (!burst || durationMs <= AUTOMATIC_PAGE_TURN_BURST_DURATION_MS) return durationMs;
  return Math.max(AUTOMATIC_PAGE_TURN_BURST_DURATION_MS, durationMs / AUTOMATIC_PAGE_TURN_BURST_MAX_SPEEDUP);
}

export function appendAutomaticPageTurn(
  turns: readonly ReaderAutomaticTurn[],
  turn: ReaderAutomaticTurn,
): readonly ReaderAutomaticTurn[] {
  return [...turns, turn];
}

export function automaticPageTurnPaintOrder(
  turns: readonly ReaderAutomaticTurn[],
  direction: 1 | -1,
): readonly ReaderAutomaticTurn[] {
  return direction > 0 ? [...turns].reverse() : turns;
}

export function automaticPageTurnTransition(turn: ReaderAutomaticTurn): ReaderPageTransitionState {
  return {
    from: turn.from,
    toKey: turn.to.key,
    direction: turn.direction,
  };
}
