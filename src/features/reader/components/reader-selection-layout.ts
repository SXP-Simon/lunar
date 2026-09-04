import type { EdgeInsets } from 'react-native-safe-area-context';

import type { ReaderRect } from '@/reader';

export const ReaderSelectionToolbarWidth = 112;
export const ReaderSelectionToolbarHeight = 52;

const ToolbarGap = 12;
const ViewportPadding = 12;

export interface ReaderSelectionControlsLayout {
  readonly toolbar: { readonly left: number; readonly top: number };
  readonly startHandle: { readonly x: number; readonly y: number };
  readonly endHandle: { readonly x: number; readonly y: number };
}

export function computeReaderSelectionControlsLayout(
  rects: readonly ReaderRect[],
  viewportWidth: number,
  viewportHeight: number,
  safeAreaInsets: EdgeInsets,
): ReaderSelectionControlsLayout | undefined {
  const first = rects[0];
  const last = rects.at(-1);
  if (!first || !last || viewportWidth <= 0 || viewportHeight <= 0) return undefined;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  const minimumTop = safeAreaInsets.top + ViewportPadding;
  const maximumTop = viewportHeight
    - safeAreaInsets.bottom
    - ViewportPadding
    - ReaderSelectionToolbarHeight;
  const aboveTop = minY - ToolbarGap - ReaderSelectionToolbarHeight;
  const belowTop = maxY + ToolbarGap;
  const top = aboveTop >= minimumTop
    ? aboveTop
    : Math.min(maximumTop, Math.max(minimumTop, belowTop));
  const centerX = (minX + maxX) / 2;
  const left = Math.min(
    viewportWidth - ViewportPadding - ReaderSelectionToolbarWidth,
    Math.max(ViewportPadding, centerX - ReaderSelectionToolbarWidth / 2),
  );
  return {
    toolbar: { left, top },
    startHandle: { x: first.x, y: first.y + first.height },
    endHandle: { x: last.x + last.width, y: last.y + last.height },
  };
}
