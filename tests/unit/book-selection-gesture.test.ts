import type { PanGesture } from 'react-native-gesture-handler';
import { describe, expect, it, vi } from 'vitest';

import { configureBookSelectionGesture } from '../../src/features/library/components/book-selection-gesture';

describe('bookshelf scroll and hold arbitration', () => {
  it('allows immediate sliding selection without hold or scroll failure constraints in selection mode', () => {
    const gesture = {
      minDistance: vi.fn().mockReturnThis(),
      activateAfterLongPress: vi.fn().mockReturnThis(),
      failOffsetX: vi.fn().mockReturnThis(),
      failOffsetY: vi.fn().mockReturnThis(),
      maxPointers: vi.fn().mockReturnThis(),
    };
    configureBookSelectionGesture(gesture as unknown as PanGesture, true);

    expect(gesture.minDistance.mock.calls[0][0]).toBeGreaterThan(0);
    expect(gesture.minDistance.mock.calls[0][0]).toBeLessThanOrEqual(1);
    expect(gesture.activateAfterLongPress).not.toHaveBeenCalled();
    expect(gesture.failOffsetX).not.toHaveBeenCalled();
    expect(gesture.failOffsetY).not.toHaveBeenCalled();
  });

  it('makes distance activation unreachable throughout the allowed hold area', () => {
    const gesture = {
      minDistance: vi.fn().mockReturnThis(),
      activateAfterLongPress: vi.fn().mockReturnThis(),
      failOffsetX: vi.fn().mockReturnThis(),
      failOffsetY: vi.fn().mockReturnThis(),
      maxPointers: vi.fn().mockReturnThis(),
    };
    configureBookSelectionGesture(gesture as unknown as PanGesture);

    const distance = gesture.minDistance.mock.calls[0][0] as number;
    const xBounds = gesture.failOffsetX.mock.calls[0][0] as [number, number];
    const yBounds = gesture.failOffsetY.mock.calls[0][0] as [number, number];

    // The four corners have the largest distance from the touch origin.
    // This catches the former zero-distance activation and diagonal bypasses.
    for (const x of xBounds) {
      for (const y of yBounds) {
        expect(Math.hypot(x, y)).toBeLessThan(distance);
      }
    }
    // A hold timer remains available when movement cannot activate the pan.
    expect(gesture.activateAfterLongPress.mock.calls[0][0]).toBeGreaterThan(0);
  });
});
