import { describe, expect, it } from 'vitest';

import {
  planarTurnProgressForTranslation,
  pageTurnRenderProgress,
  projectedPlanarTurnProgress,
  singlePreviousCurlProgress,
  singlePreviousCurlRevealProgress,
  shouldCommitPlanarTurn,
} from '../../src/reader/skia/anime/page-turn-gesture';

describe('reader planar page turn gesture', () => {
  it('tracks the physical finger travel across the page', () => {
    expect(planarTurnProgressForTranslation(-70, 100)).toBe(0.7);
    expect(planarTurnProgressForTranslation(20, 100)).toBe(0.2);
  });

  it('uses half-speed paper travel for the next turn in single-page mode', () => {
    expect(pageTurnRenderProgress(0.5, 1, 'single')).toBe(0.25);
    expect(pageTurnRenderProgress(1, 1, 'single')).toBe(0.5);
    expect(pageTurnRenderProgress(0.5, 1, 'double')).toBe(0.5);
  });

  it('keeps previous-turn gesture travel and drives the incoming landing', () => {
    expect(pageTurnRenderProgress(0.5, -1, 'single')).toBe(0.5);
    expect(singlePreviousCurlProgress(0)).toBe(0.15);
    expect(singlePreviousCurlProgress(0.1)).toBe(0.15);
    expect(singlePreviousCurlProgress(0.55)).toBeCloseTo(0.575);
    expect(singlePreviousCurlProgress(1)).toBe(1);
    expect(singlePreviousCurlRevealProgress(0)).toBe(0);
    expect(singlePreviousCurlRevealProgress(0.05)).toBe(0.5);
    expect(singlePreviousCurlRevealProgress(0.1)).toBe(1);
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
