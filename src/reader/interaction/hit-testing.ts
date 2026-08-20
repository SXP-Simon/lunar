import type { HitMap, TextPosition } from '@ritojs/core/advanced';

export type ReaderHitTargetType = 'text' | 'link' | 'image' | 'footnote';

export interface ReaderHitTarget {
  readonly type: ReaderHitTargetType;
  readonly href?: string;
  readonly imageSource?: string;
  readonly textPosition?: TextPosition;
}

export interface ReaderHitTester {
  setHitMap(hitMap: HitMap): void;
  hitTest(x: number, y: number): ReaderHitTarget | undefined;
  clear(): void;
}
