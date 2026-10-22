import type {
  ReaderLocator,
  ReaderPhase,
  ReaderSearchRequest,
  ReaderSearchResponse,
  ReaderTextSegment,
  ReaderTocEntry,
} from '@/reader';
import type { ReaderSessionEventSource } from '../services/reader-session-event-bus';
import type { ReaderInteractionMode } from './reader-interaction';
import type { ReaderSessionLifecycle, ReaderSessionLocation } from './reader-session-events';

export interface ReaderSessionBook {
  readonly id: string;
  readonly title: string;
  readonly author?: string;
  readonly language?: string;
}

export interface ReaderSessionState {
  readonly lifecycle: ReaderSessionLifecycle;
  readonly phase: ReaderPhase;
  readonly book?: ReaderSessionBook;
  readonly location?: ReaderSessionLocation;
  readonly interaction: ReaderInteractionMode;
}

/** Text painted on the visible frame, with the identity needed to place marks on it again. */
export interface ReaderVisibleText {
  readonly revisionId: number;
  /** Painted-content identity of the frame the segments belong to. */
  readonly frameKey?: string;
  readonly href?: string;
  readonly segments: readonly ReaderTextSegment[];
}

/**
 * The reading session as seen from outside the reader screen. Navigation
 * methods resolve to `false` when the current interaction does not allow them,
 * instead of racing a page turn, selection or covering surface.
 */
export interface ReaderSessionPort {
  readonly events: ReaderSessionEventSource;
  getState(): ReaderSessionState;
  subscribe(listener: () => void): () => void;
  getToc(): readonly ReaderTocEntry[];
  getVisibleText(): ReaderVisibleText | undefined;
  search(request: ReaderSearchRequest): Promise<ReaderSearchResponse>;
  next(): Promise<boolean>;
  previous(): Promise<boolean>;
  goToLocator(locator: ReaderLocator): Promise<boolean>;
  goToChapter(href: string): Promise<boolean>;
  goToProgression(progression: number): Promise<boolean>;
}
