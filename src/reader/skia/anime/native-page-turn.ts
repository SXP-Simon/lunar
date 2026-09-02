import type { ReaderAutomaticTurn, ReaderPageContent } from './page-transition';

const NATIVE_TURN_ID_PREFIX = 'lunar-automatic:';

export interface NativeAutomaticPageTurnFaces {
  readonly front: ReaderPageContent;
  readonly background: ReaderPageContent;
}

export function nativeAutomaticPageTurnFaces(
  turn: ReaderAutomaticTurn,
): NativeAutomaticPageTurnFaces {
  return turn.direction > 0
    ? { front: turn.from, background: turn.to }
    : { front: turn.to, background: turn.from };
}

export function nativeAutomaticPageTurnId(turnId: number): string {
  return `${NATIVE_TURN_ID_PREFIX}${turnId}`;
}

export function readerAutomaticPageTurnId(value: string): number | undefined {
  if (!value.startsWith(NATIVE_TURN_ID_PREFIX)) return undefined;
  const turnId = Number(value.slice(NATIVE_TURN_ID_PREFIX.length));
  return Number.isSafeInteger(turnId) && turnId > 0 ? turnId : undefined;
}
