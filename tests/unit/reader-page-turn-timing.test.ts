import { describe, expect, it } from 'vitest';

import {
  getReaderPageTurnDuration,
  getReaderPageTurnSettleDuration,
  PAGE_TURN_DURATION_MS,
  resolveReaderPageAnimationStyle,
} from '../../src/reader/skia/anime/page-turn-timing';

describe('reader page turn timing', () => {
  it('keeps paper animations on their fixed duration', () => {
    expect(getReaderPageTurnDuration('page', 6)).toBe(PAGE_TURN_DURATION_MS);
    expect(getReaderPageTurnDuration('simulation', 2)).toBe(PAGE_TURN_DURATION_MS);
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
});
