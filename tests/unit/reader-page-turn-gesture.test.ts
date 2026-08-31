import { describe, expect, it } from 'vitest';

import {
  planarTurnProgressForTranslation,
  projectedPlanarTurnProgress,
  shouldCommitPlanarTurn,
} from '../../src/reader/skia/anime/page-turn-gesture';

describe('reader planar page turn gesture', () => {
  it('tracks the physical finger travel across the page', () => {
    expect(planarTurnProgressForTranslation(-70, 100)).toBe(0.7);
    expect(planarTurnProgressForTranslation(20, 100)).toBe(0.2);
  });

  it('commits a slow drag after crossing half of the page', () => {
    expect(shouldCommitPlanarTurn(0.7, 0)).toBe(true);
    expect(shouldCommitPlanarTurn(0.49, 0)).toBe(false);
  });

  it('projects release velocity toward the destination', () => {
    expect(projectedPlanarTurnProgress(0.4, 1)).toBeCloseTo(0.58);
    expect(projectedPlanarTurnProgress(0.4, -1)).toBeCloseTo(0.22);
    expect(shouldCommitPlanarTurn(0.4, 1)).toBe(true);
    expect(shouldCommitPlanarTurn(0.4, -1)).toBe(false);
  });
});
