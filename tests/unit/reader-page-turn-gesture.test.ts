import { describe, expect, it } from 'vitest';

import {
  PLANAR_RELEASE_PROJECTION_SECONDS,
  projectedPageTurnProgress,
} from '../../src/reader/skia/anime/core/page-turn-math';
import {
  singlePreviousCurlProgress,
  singlePreviousCurlRevealProgress,
} from '../../src/reader/skia/anime/effects/curl/progress';
import { curlPageTurnEffect } from '../../src/reader/skia/anime/effects/curl/strategy';
import {
  SLIDE_RELEASE_PROJECTION_SECONDS,
  slidePageTurnEffect,
} from '../../src/reader/skia/anime/effects/slide/strategy';
import { planarTurnProgressForTranslation } from '../../src/reader/skia/anime/gesture/page-turn-gesture';

describe('reader page turn gesture effects', () => {
  it('tracks directed physical finger travel across the page', () => {
    expect(planarTurnProgressForTranslation(-70, 1, 100)).toBe(0.7);
    expect(planarTurnProgressForTranslation(20, -1, 100)).toBe(0.2);
    expect(planarTurnProgressForTranslation(20, 1, 100)).toBe(0);
  });

  it('keeps half-speed single-page travel inside the curl effect', () => {
    expect(curlPageTurnEffect.gesture.renderProgress({
      physicalProgress: 0.5,
      direction: 1,
      spreadMode: 'single',
    })).toBe(0.25);
    expect(curlPageTurnEffect.gesture.renderProgress({
      physicalProgress: 1,
      direction: 1,
      spreadMode: 'single',
    })).toBe(0.5);
    expect(slidePageTurnEffect.gesture.renderProgress({
      physicalProgress: 0.5,
      direction: 1,
      spreadMode: 'single',
    })).toBe(0.5);
    expect(curlPageTurnEffect.gesture.renderProgress({
      physicalProgress: 0.5,
      direction: 1,
      spreadMode: 'double',
    })).toBe(0.5);
  });

  it('keeps the incoming curl landing calculation in the curl package', () => {
    expect(curlPageTurnEffect.gesture.renderProgress({
      physicalProgress: 0.5,
      direction: -1,
      spreadMode: 'single',
    })).toBe(0.5);
    expect(singlePreviousCurlProgress(0)).toBe(0.15);
    expect(singlePreviousCurlProgress(0.1)).toBe(0.15);
    expect(singlePreviousCurlProgress(0.55)).toBeCloseTo(0.5335365854);
    expect(singlePreviousCurlProgress(1)).toBe(1);
    expect(singlePreviousCurlRevealProgress(0)).toBe(0);
    expect(singlePreviousCurlRevealProgress(0.09)).toBe(0.5);
    expect(singlePreviousCurlRevealProgress(0.18)).toBe(1);
  });

  it('lets each effect own its commit prediction', () => {
    expect(slidePageTurnEffect.gesture.shouldCommit({
      progress: 0.7,
      towardTargetVelocity: 0,
    })).toBe(true);
    expect(slidePageTurnEffect.gesture.shouldCommit({
      progress: 0.49,
      towardTargetVelocity: 0,
    })).toBe(false);
    expect(slidePageTurnEffect.gesture.shouldCommit({
      progress: 0.4,
      towardTargetVelocity: 1,
    })).toBe(true);
    expect(curlPageTurnEffect.gesture.shouldCommit({
      progress: 0.4,
      towardTargetVelocity: 1,
    })).toBe(true);
    expect(curlPageTurnEffect.gesture.shouldCommit({
      progress: 0.5,
      towardTargetVelocity: 0,
    })).toBe(false);
  });

  it('keeps each release projection duration independently testable', () => {
    expect(projectedPageTurnProgress(
      0.4,
      1,
      PLANAR_RELEASE_PROJECTION_SECONDS,
    )).toBeCloseTo(0.58);
    expect(projectedPageTurnProgress(
      0.4,
      -1,
      PLANAR_RELEASE_PROJECTION_SECONDS,
    )).toBeCloseTo(0.22);
    expect(projectedPageTurnProgress(
      0.4,
      1,
      SLIDE_RELEASE_PROJECTION_SECONDS,
    )).toBeCloseTo(0.64);
  });
});
