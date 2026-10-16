/** Keep month starts anchored to their week; prefer newer labels when space is tight. */
export function layoutMonthLabels(
  candidates: { date: string; column: number; width: number }[],
  stride: number,
  gridWidth: number,
  gap = 8,
) {
  let rightBoundary = gridWidth + gap;
  return candidates
    .toReversed()
    .flatMap((label) => {
      const left = label.column * stride;
      // Never move a label onto another week's column or clip it at the right edge.
      if (label.width <= 0 || left + label.width + gap > rightBoundary) return [];
      rightBoundary = left;
      return [{ ...label, left }];
    })
    .toReversed();
}
