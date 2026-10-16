import { describe, expect, it } from 'vitest';
import { heatmapDimensions, layoutMonthLabels } from '../../src/features/statistics/domain/month-labels';

describe('heatmap month label spacing', () => {
  it('reserves enough row height and weekday width when system fonts grow on narrow screens', () => {
    for (const width of [320, 360, 411])
      for (const scale of [1, 1.3, 2]) {
        const { weekdayWidth, cellSize, rowHeight } = heatmapDimensions(width - 32, scale);
        expect(rowHeight).toBeGreaterThanOrEqual(20 * scale);
        expect(weekdayWidth).toBeGreaterThanOrEqual(24 * scale);
        expect(weekdayWidth + 8 + 13 * cellSize + 48 + 40).toBeLessThanOrEqual(width - 32);
      }
  });
  it('keeps calendar week anchors without overlapping at normal and narrow widths', () => {
    for (const cell of [12, 19, 24]) {
      const labels = layoutMonthLabels(
        [
          { date: '2026-08-01', column: 1, width: 23 },
          { date: '2026-09-01', column: 6, width: 23 },
          { date: '2026-10-01', column: 10, width: 28 },
        ],
        cell + 4,
        cell * 13 + 48,
      );
      expect(labels).toHaveLength(3);
      expect(labels.map((label) => label.left)).toEqual([1, 6, 10].map((column) => column * (cell + 4)));
    }
  });
  it('hides an earlier label when enlarged text collides, keeping the newer month', () => {
    expect(
      layoutMonthLabels(
        [
          { date: '2026-08-01', column: 1, width: 95 },
          { date: '2026-09-01', column: 6, width: 80 },
          { date: '2026-10-01', column: 10, width: 35 },
        ],
        16,
        204,
      ).map((label) => label.date),
    ).toEqual(['2026-08-01', '2026-10-01']);
  });
  it('hides unmeasured or clipped labels instead of shifting their calendar anchors', () => {
    expect(
      layoutMonthLabels(
        [
          { date: '2026-12-01', column: 0, width: 0 },
          { date: '2027-01-01', column: 12, width: 25 },
        ],
        16,
        204,
      ),
    ).toEqual([]);
  });
});
