import type {
  ReaderAutomaticTurn,
  ReaderNativeGestureState,
  ReaderPageContent,
} from './page-transition';

const NATIVE_TURN_ID_PREFIX = 'lunar-automatic:';
const NATIVE_INTERACTIVE_TURN_ID_PREFIX = 'lunar-interactive:';

export interface NativeInteractivePageTurnIdentity {
  readonly gestureToken: number;
  readonly preparedTurnId: number;
}

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

export function nativeInteractivePageTurnStockId(
  gestureToken: number,
  preparedTurnId: number,
): string {
  return `${NATIVE_INTERACTIVE_TURN_ID_PREFIX}${gestureToken}:${preparedTurnId}`;
}

export function readerInteractivePageTurnIdentity(
  value: string,
): NativeInteractivePageTurnIdentity | undefined {
  const match = /^lunar-interactive:(\d+):(\d+)(?:#turn:\d+(?::rapid)?)?$/.exec(value);
  if (!match) return undefined;
  const gestureToken = Number(match[1]);
  const preparedTurnId = Number(match[2]);
  if (
    !Number.isSafeInteger(gestureToken)
    || gestureToken <= 0
    || !Number.isSafeInteger(preparedTurnId)
    || preparedTurnId <= 0
  ) {
    return undefined;
  }
  return { gestureToken, preparedTurnId };
}

export function nativeInteractivePageTurnBaseContent(
  source: ReaderPageContent | undefined,
  target: ReaderPageContent | undefined,
  gesture: ReaderNativeGestureState | undefined,
): ReaderPageContent | undefined {
  if (!gesture?.driven) return undefined;
  return gesture.consumed ? target : source;
}

export function nativeAutomaticPageTurnBaseContent(
  turns: readonly ReaderAutomaticTurn[],
  current: ReaderPageContent | undefined,
  hasPresentedTurn: boolean,
): ReaderPageContent | undefined {
  if (turns.length === 0) return current;
  return hasPresentedTurn ? current ?? turns.at(-1)?.to : turns[0]?.from;
}
