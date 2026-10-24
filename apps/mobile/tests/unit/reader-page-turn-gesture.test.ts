import { describe, expect, it } from 'vitest';

import {
  PLANAR_RELEASE_PROJECTION_SECONDS,
  projectedPageTurnProgress,
} from '../../src/reader/skia/anime/core/page-turn-math';
import { createGestureCurlProfile, curlRevertDurationMs } from '../../src/reader/skia/anime/effects/curl/geometry';
import {
  GESTURE_HINGE_CHORD_X,
  GESTURE_LIFT_START_FINGER_X,
  MIN_PRESSED_EDGE_X,
} from '../../src/reader/skia/anime/effects/curl/gesture';
import {
  gestureSinglePreviousCurlRevealProgress,
  gestureSinglePreviousCurlShapeProgress,
  singlePreviousCurlProgress,
  singlePreviousCurlRevealProgress,
} from '../../src/reader/skia/anime/effects/curl/progress';
import { curlPageTurnEffect } from '../../src/reader/skia/anime/effects/curl/strategy';
import {
  SLIDE_RELEASE_PROJECTION_SECONDS,
  slidePageTurnEffect,
} from '../../src/reader/skia/anime/effects/slide/strategy';
import {
  planarTurnProgressForTranslation,
  releaseIdleDecay,
  trackThrowAcceleration,
  trackThrowVelocity,
} from '../../src/reader/skia/anime/gesture/page-turn-gesture';

describe('reader page turn gesture effects', () => {
  it('uses Persimmon pressed-roll geometry', () => {
    expect(MIN_PRESSED_EDGE_X).toBe(0.14);
    expect(GESTURE_LIFT_START_FINGER_X).toBe(0.36);
    expect(GESTURE_HINGE_CHORD_X).toBeCloseTo(0.1514800382);
  });
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
    })).toBeCloseTo(0.5 / 0.72);
    expect(curlPageTurnEffect.gesture.renderProgress({
      physicalProgress: 0.72,
      direction: -1,
      spreadMode: 'single',
    })).toBe(1);
    expect(singlePreviousCurlProgress(0)).toBe(0.15);
    expect(singlePreviousCurlProgress(0.1)).toBe(0.15);
    expect(singlePreviousCurlProgress(0.55)).toBeCloseTo(0.5335365854);
    expect(singlePreviousCurlProgress(1)).toBe(1);
    expect(singlePreviousCurlRevealProgress(0)).toBe(0);
    expect(singlePreviousCurlRevealProgress(0.09)).toBe(0.5);
    expect(singlePreviousCurlRevealProgress(0.18)).toBe(1);
    expect(gestureSinglePreviousCurlShapeProgress(0.1)).toBe(0.15);
    expect(gestureSinglePreviousCurlShapeProgress(0.55)).toBeCloseTo(0.575);
    expect(gestureSinglePreviousCurlRevealProgress(0.05)).toBe(0.5);
    expect(gestureSinglePreviousCurlRevealProgress(0.1)).toBe(1);
  });

  it('lets each effect own its commit prediction', () => {
    expect(slidePageTurnEffect.gesture.shouldCommit({
      progress: 0.7,
      towardTargetVelocity: 0,
      direction: 1,
      spreadMode: 'single',
      startBookX: 1,
      fingerX: 0.3,
      throwVelocity: 0,
      throwAcceleration: 0,
    })).toBe(true);
    expect(slidePageTurnEffect.gesture.shouldCommit({
      progress: 0.49,
      towardTargetVelocity: 0,
      direction: 1,
      spreadMode: 'single',
      startBookX: 1,
      fingerX: 0.3,
      throwVelocity: 0,
      throwAcceleration: 0,
    })).toBe(false);
    expect(slidePageTurnEffect.gesture.shouldCommit({
      progress: 0.4,
      towardTargetVelocity: 1,
      direction: 1,
      spreadMode: 'single',
      startBookX: 1,
      fingerX: 0.3,
      throwVelocity: 1,
      throwAcceleration: 0,
    })).toBe(true);
    expect(curlPageTurnEffect.gesture.shouldCommit({
      progress: 0.4,
      towardTargetVelocity: 1,
      direction: 1,
      spreadMode: 'single',
      startBookX: 1,
      fingerX: 0,
      throwVelocity: 1,
      throwAcceleration: 0,
    })).toBe(true);
  });

  it('asks a single page for the same commit travel in both directions', () => {
    // A slow forward drag carries the sheet 0.49 screen widths before the
    // commit — the travel a spread already asked of one physical page — while
    // the incoming reveal asks for 0.36 instead of a 0.11 sliver.
    const slowForward = (fingerX: number) => curlPageTurnEffect.gesture.shouldCommit({
      progress: (1 - fingerX) / 2,
      towardTargetVelocity: 0,
      direction: 1,
      spreadMode: 'single',
      startBookX: 1,
      fingerX,
      throwVelocity: 0,
      throwAcceleration: 0,
    });
    const slowReveal = (revealedTravel: number) => curlPageTurnEffect.gesture.shouldCommit({
      progress: revealedTravel / 0.72,
      towardTargetVelocity: 0,
      direction: -1,
      spreadMode: 'single',
      startBookX: 0.2,
      fingerX: 1 - revealedTravel,
      throwVelocity: 0,
      throwAcceleration: 0,
    });

    expect(slowForward(0.567)).toBe(false);
    expect(slowForward(0.5)).toBe(true);
    expect(slowReveal(0.11)).toBe(false);
    expect(slowReveal(0.36)).toBe(true);
  });

  it('keeps the Persimmon commit travel for a spread', () => {
    const slowForward = (fingerX: number) => curlPageTurnEffect.gesture.shouldCommit({
      progress: 0.5,
      towardTargetVelocity: 0,
      direction: 1,
      spreadMode: 'double',
      startBookX: 1,
      fingerX,
      throwVelocity: 0,
      throwAcceleration: 0,
    });

    expect(slowForward(0.14)).toBe(false);
    expect(slowForward(0.02)).toBe(true);
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

  it('only presses the page when a drag starts near the spine', () => {
    const weak = curlPageTurnEffect.gesture.getGeometry({ startBookX: 0.2, translationX: -150, direction: 1, pageWidth: 300 });
    expect(weak.heldRollTilt).toBe(0);
    expect(weak.pressedEdgeX).toBeCloseTo(0.96);
    const full = curlPageTurnEffect.gesture.getGeometry({ startBookX: 0.8, translationX: -150, direction: 1, pageWidth: 300 });
    expect(full.pressedEdgeX).toBeLessThan(0.6);

    const profile = createGestureCurlProfile({
      progress: 0.4, direction: 1, startBookX: 0.2, pressedEdgeX: weak.pressedEdgeX, heldRollTilt: 0,
      spreadMode: 'single', settling: false, settleTo: 0, releaseProgress: 0.4,
    });
    expect(profile.rotation).toBe(0);
    expect(profile.landedLength).toBe(0);
    expect(curlPageTurnEffect.native?.gesture.canStart(1, 0.2)).toBe(false);
  });

  it('eases a cancelled roll back faster the tighter it was rolled', () => {
    expect(curlRevertDurationMs(1)).toBe(0);
    // A weak grip only compressed the edge, so it releases within a few frames.
    expect(curlRevertDurationMs(0.96)).toBeGreaterThan(1000 / 60);
    expect(curlRevertDurationMs(0.96)).toBeLessThan(100);
    expect(curlRevertDurationMs(MIN_PRESSED_EDGE_X)).toBeCloseTo((3000 * (1 - MIN_PRESSED_EDGE_X)) / 6.3);
    const settle = (pressedEdgeX: number) => curlPageTurnEffect.motion.getSettleDuration({
      fromProgress: 0.15, targetProgress: 0, releaseVelocity: 0, throwVelocity: 0, animationDuration: 947,
      pageWidth: 400, direction: 1, spreadMode: 'single', fingerX: 0.7, pressedEdgeX, heldRollTilt: 0, startBookX: 1,
    });
    expect(settle(0.7)).toBe(Math.round(curlRevertDurationMs(0.7)));
  });

  it('tracks the throw by elapsed time, not by sample count', () => {
    const track = (sampleSeconds: number) => {
      let velocity = 0;
      let acceleration = 0;
      for (let elapsed = 0; elapsed < 0.1 - 1e-9; elapsed += sampleSeconds) {
        const previous = velocity;
        velocity = trackThrowVelocity(velocity, -800, 1, 400, sampleSeconds);
        acceleration = trackThrowAcceleration(acceleration, previous, velocity, sampleSeconds);
      }
      return { velocity, acceleration };
    };
    const at60Hz = track(1 / 60);
    const at120Hz = track(1 / 120);
    expect(at120Hz.velocity).toBeCloseTo(at60Hz.velocity, 6);
    // 2 page widths per second approached with a 45 ms time constant.
    expect(at60Hz.velocity).toBeCloseTo(2 * (1 - Math.exp(-0.1 / 0.045)), 2);
    expect(at120Hz.acceleration).toBeCloseTo(at60Hz.acceleration, 0);
  });

  it('drops the throw of a finger that rested before lifting', () => {
    expect(releaseIdleDecay(0)).toBe(1);
    expect(releaseIdleDecay(0.1)).toBeCloseTo(Math.exp(-1));
    expect(releaseIdleDecay(0.5)).toBeLessThan(0.01);
  });
});
