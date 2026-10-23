import type { ReaderPageTurnStore } from '../controller/page-turn-store';
import type { PageTurnGestureValues } from '../gesture/use-page-turn-pan-gesture';
import type { NativePagerEventRecord } from './pager-compositor';

/** What the reader surface needs from a page-turn controller. */
export interface ReaderPageTurnSurfaceBinding {
  readonly store: ReaderPageTurnStore;
  readonly values: PageTurnGestureValues;
  readonly onNativeEvent: (event: NativePagerEventRecord) => void;
  /** The composer accepted the pair stocked under this token. */
  readonly onStocked: (token: number) => void;
  /** The composer was re-anchored and holds no stocked pair. */
  readonly onStockLost: () => void;
  readonly completeAutomaticTurn: (turnId: number) => void;
}
