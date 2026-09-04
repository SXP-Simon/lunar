import { describe, expect, it } from 'vitest';

import {
  AUTOMATIC_PLANAR_PAGE_TURN_MIN_DURATION_MS,
  getAutomaticPlanarPageTurnDuration,
  getReaderPageTurnDuration,
  getReaderPageTurnSettleDuration,
  getSlidePageTurnEasing,
  PAGE_TURN_DURATION_MS,
  resolveReaderPageAnimationStyle,
} from '../../src/reader/skia/anime/core/page-turn-timing';

describe('reader page turn timing', () => {
  it('keeps paper animations on their fixed duration', () => {
    expect(getReaderPageTurnDuration('page', 6)).toBe(PAGE_TURN_DURATION_MS);
    expect(getReaderPageTurnDuration('simulation', 2)).toBe(PAGE_TURN_DURATION_MS);
    expect(getReaderPageTurnDuration('page', 0, 360, true)).toBe(854);
  });

  it('shortens planar animations according to release speed', () => {
    expect(getReaderPageTurnDuration('slide', 0, 360)).toBe(360);
    expect(getReaderPageTurnDuration('slide', 2, 360)).toBe(302);
    expect(getReaderPageTurnDuration('cover', 20, 360)).toBe(187);
  });

  it('normalizes aliases and invalid custom durations', () => {
    expect(resolveReaderPageAnimationStyle('overlay')).toBe('cover');
    expect(resolveReaderPageAnimationStyle('pageCurl')).toBe('page');
    expect(getReaderPageTurnDuration('slide', 0, Number.NaN)).toBe(360);
  });

  it('scales release animation time by the remaining distance', () => {
    expect(getReaderPageTurnSettleDuration('slide', 0.7, 1, 0, 360)).toBe(108);
    expect(getReaderPageTurnSettleDuration('slide', 0.7, 0, 0, 360)).toBe(252);
    expect(getReaderPageTurnSettleDuration('page', 0.5, 1)).toBe(260);
  });

  it('uses the Readest slide curve when settling without release momentum', () => {
    const easing = getSlidePageTurnEasing(0.5, 1);

    expect(easing(0)).toBe(0);
    expect(easing(0.25)).toBeCloseTo(0.125);
    expect(easing(0.5)).toBe(0.5);
    expect(easing(0.75)).toBeCloseTo(0.875);
    expect(easing(1)).toBe(1);
  });

  it('blends toward ease-out only when release momentum points at the target', () => {
    const towardTarget = getSlidePageTurnEasing(0.5, 1, 1);
    const awayFromTarget = getSlidePageTurnEasing(0.5, 1, -1);
    const returning = getSlidePageTurnEasing(0.5, 0, -1);

    expect(towardTarget(0.25)).toBeCloseTo(0.2760416667);
    expect(awayFromTarget(0.25)).toBeCloseTo(0.125);
    expect(returning(0.25)).toBeCloseTo(0.2760416667);
  });

  it('accelerates queued planar turns without restarting their completed progress', () => {
    expect(getAutomaticPlanarPageTurnDuration('slide', 1, 0, 360)).toBe(360);
    expect(getAutomaticPlanarPageTurnDuration('slide', 2, 0, 360)).toBe(180);
    expect(getAutomaticPlanarPageTurnDuration('slide', 4, 0, 360))
      .toBe(AUTOMATIC_PLANAR_PAGE_TURN_MIN_DURATION_MS);
    expect(getAutomaticPlanarPageTurnDuration('slide', 4, 0.5, 360)).toBe(50);
  });
});
