import { describe, expect, it } from 'vitest';

import { AUTOMATIC_PLANAR_PAGE_TURN_MIN_DURATION_MS } from '../../src/reader/skia/anime/core/page-turn-math';
import { coverPageTurnEffect } from '../../src/reader/skia/anime/effects/cover/strategy';
import {
  curlPageTurnEffect,
  PAGE_TURN_DURATION_MS,
} from '../../src/reader/skia/anime/effects/curl/strategy';
import { getReaderPageTurnEffect } from '../../src/reader/skia/anime/effects/page-turn-effects';
import {
  getSlidePageTurnEasing,
  slidePageTurnEffect,
} from '../../src/reader/skia/anime/effects/slide/strategy';

describe('reader page turn effect timing', () => {
  it('keeps curl animations on their fixed duration', () => {
    expect(curlPageTurnEffect.motion.getDuration({
      releaseVelocity: 6,
      animationDuration: 360,
      incomingPageLanding: false,
    })).toBe(PAGE_TURN_DURATION_MS);
    expect(curlPageTurnEffect.motion.getDuration({
      releaseVelocity: 0,
      animationDuration: 360,
      incomingPageLanding: true,
    })).toBe(854);
  });

  it('shortens planar animations according to release speed', () => {
    expect(slidePageTurnEffect.motion.getDuration({
      releaseVelocity: 0,
      animationDuration: 360,
      incomingPageLanding: false,
    })).toBe(360);
    expect(slidePageTurnEffect.motion.getDuration({
      releaseVelocity: 2,
      animationDuration: 360,
      incomingPageLanding: false,
    })).toBe(302);
    expect(coverPageTurnEffect.motion.getDuration({
      releaseVelocity: 20,
      animationDuration: 360,
      incomingPageLanding: false,
    })).toBe(187);
  });

  it('resolves compatibility names to one effect instance', () => {
    expect(getReaderPageTurnEffect('overlay')).toBe(coverPageTurnEffect);
    expect(getReaderPageTurnEffect('pageCurl')).toBe(curlPageTurnEffect);
    expect(getReaderPageTurnEffect('simulation')).toBe(curlPageTurnEffect);
    expect(getReaderPageTurnEffect('slide')).toBe(slidePageTurnEffect);
    expect(slidePageTurnEffect.motion.getDuration({
      releaseVelocity: 0,
      animationDuration: Number.NaN,
      incomingPageLanding: false,
    })).toBe(360);
  });

  it('keeps visual calculations and native capability in each effect', () => {
    expect(slidePageTurnEffect.visual.getIncomingTransform({
      direction: 1,
      width: 400,
      progress: 0.25,
    })).toEqual([{ translateX: 300 }]);
    expect(slidePageTurnEffect.visual.getOutgoingTransform({
      direction: -1,
      width: 400,
      progress: 0.25,
    })).toEqual([{ translateX: 100 }]);
    expect(coverPageTurnEffect.visual.getPrimaryTransform({
      direction: 1,
      width: 400,
      progress: 0.25,
    })).toEqual([
      { translateX: 400 },
      { scaleX: 0.25 },
      { translateX: -400 },
    ]);
    expect(curlPageTurnEffect.visual.isIncomingPageLanding(-1, 'single')).toBe(true);
    expect(curlPageTurnEffect.native?.motion.automatic.backward)
      .toMatchObject({ incomingRevertDurationSeconds: 0.72 });
    expect(slidePageTurnEffect.native).toBeUndefined();
  });

  it('lets each effect calculate its release and rebound duration', () => {
    expect(slidePageTurnEffect.motion.getSettleDuration({
      fromProgress: 0.7,
      targetProgress: 1,
      releaseVelocity: 0,
      animationDuration: 360,
      pageWidth: 0,
    })).toBe(108);
    expect(slidePageTurnEffect.motion.getSettleDuration({
      fromProgress: 0.7,
      targetProgress: 0,
      releaseVelocity: 0,
      animationDuration: 360,
      pageWidth: 0,
    })).toBe(252);
    expect(slidePageTurnEffect.motion.getSettleDuration({
      fromProgress: 0.95,
      targetProgress: 1,
      releaseVelocity: 4,
      animationDuration: 360,
      pageWidth: 400,
    })).toBe(18);
    expect(slidePageTurnEffect.motion.getSettleDuration({
      fromProgress: 0.5,
      targetProgress: 1,
      releaseVelocity: 3.75,
      animationDuration: 1000,
      pageWidth: 400,
    })).toBe(250);
    expect(slidePageTurnEffect.motion.getSettleDuration({
      fromProgress: 0.5,
      targetProgress: 1,
      releaseVelocity: -3.75,
      animationDuration: 1000,
      pageWidth: 400,
    })).toBe(500);
    expect(curlPageTurnEffect.motion.getSettleDuration({
      fromProgress: 0.5,
      targetProgress: 1,
      releaseVelocity: 0,
      animationDuration: 360,
      pageWidth: 400,
    })).toBe(260);
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

  it('accelerates queued planar turns without restarting completed progress', () => {
    const duration = (queuedTurnCount: number, fromProgress: number) =>
      slidePageTurnEffect.motion.getAutomaticDuration({
        queuedTurnCount,
        fromProgress,
        animationDuration: 360,
        incomingPageLanding: false,
      });

    expect(duration(1, 0)).toBe(360);
    expect(duration(2, 0)).toBe(180);
    expect(duration(4, 0)).toBe(AUTOMATIC_PLANAR_PAGE_TURN_MIN_DURATION_MS);
    expect(duration(4, 0.5)).toBe(50);
  });
});
