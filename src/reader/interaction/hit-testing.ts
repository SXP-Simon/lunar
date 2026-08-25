export interface ReaderTextPosition {
  readonly blockIndex: number;
  readonly lineIndex: number;
  readonly runIndex: number;
  readonly charIndex: number;
}

import type { ReaderHitEntry } from '../contracts';

export interface ReaderHitMap {
  readonly entries: readonly ReaderHitEntry[];
  readonly pageIndex: number;
}

export type ReaderHitTargetType = 'text' | 'link' | 'image' | 'footnote';

export interface ReaderHitTarget {
  readonly type: ReaderHitTargetType;
  readonly href?: string;
  readonly imageSource?: string;
  readonly textPosition?: ReaderTextPosition;
}

export interface ReaderHitTester {
  setHitMap(hitMap: ReaderHitMap): void;
  hitTest(x: number, y: number): ReaderHitTarget | undefined;
  clear(): void;
}
