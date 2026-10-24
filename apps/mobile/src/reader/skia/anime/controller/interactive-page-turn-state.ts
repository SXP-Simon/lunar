import type { ReaderSnapshot } from '../../../contracts';
import type { ReaderPreparedTurn } from '../../../runtime/core/native-reader-runtime';
import type { ReaderPageContent } from '../core/page-turn-types';

export interface ReaderDragState {
  readonly performanceId?: string;
  readonly id: number;
  readonly revisionId: number;
  readonly startSpread: number;
  readonly startX: number;
  readonly source: ReaderPageContent;
  /** Stock token of the prepared pair; 0 until the drag owns one. */
  nativeGestureToken: number;
  direction: 1 | -1;
  directionLocked: boolean;
  pendingPublished: boolean;
  startBookX: number;
  physicalProgress: number;
  renderProgress: number;
  grabX: number;
  grabY: number;
  fingerX: number;
  pressedEdgeX: number;
  heldRollTilt: number;
  throwVelocity: number;
  throwAcceleration: number;
  preparing: boolean;
  prepared: boolean;
  preparation?: Promise<ReaderPreparedTurn | undefined>;
  preparedTurn?: ReaderPreparedTurn;
  target?: ReaderPageContent;
  targetUnavailableLogged?: boolean;
}

export interface ReaderCommittedHandoff {
  readonly performanceId?: string;
  readonly turnId: number;
  readonly generation: number;
  readonly revisionId: number;
  readonly spreadIndex: number;
  readonly renderId: number;
  readonly nativeTurnId?: string;
  waitingForFrames?: boolean;
}

export interface ReaderNativeGestureHandoff {
  readonly turnId: number;
  readonly gestureToken: number;
  readonly preparedTurn: ReaderPreparedTurn;
  readonly generation: number;
  commit?: Promise<ReaderSnapshot>;
  terminalEventHandled: boolean;
}
