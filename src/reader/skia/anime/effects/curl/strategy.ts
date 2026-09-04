import type { ReaderPageTurnEffect } from '../../core/page-turn-effect';
import {
  clampUnit,
  crossesPageTurnCommitThreshold,
} from '../../core/page-turn-math';
import { NATIVE_CURL_MOTION_CONFIG } from './native-motion';
import {
  anchoredGestureFingerX,
  bookXForGestureTravel,
  gestureLiftRotationForFingerX,
  gesturePressedChordForFingerX,
  pageTurnStartBookXForTouch,
} from './gesture';

export const AUTOMATIC_PAGE_TURN_DURATION_MS = 947;
export const PAGE_TURN_DURATION_MS = AUTOMATIC_PAGE_TURN_DURATION_MS;
export const PAGE_TURN_GESTURE_SETTLE_DURATION_MS = 520;
export const PAGE_TURN_REVERSE_DURATION_MS = 854;
export const PAGE_TURN_REVERT_DURATION_MS = 720;

export const curlPageTurnEffect: ReaderPageTurnEffect = {
  style: 'page',
  visual: {
    kind: 'curl',
    isIncomingPageLanding: (direction, spreadMode) =>
      spreadMode === 'single' && direction === -1,
    getPrimaryTransform: () => {
      'worklet';
      return [];
    },
    getIncomingTransform: () => {
      'worklet';
      return [];
    },
    getOutgoingTransform: () => {
      'worklet';
      return [];
    },
  },
  gesture: {
    getStartBookX: pageTurnStartBookXForTouch,
    getGeometry: ({ startBookX, translationX, direction, pageWidth }) => {
      'worklet';
      const currentBookX = bookXForGestureTravel(
        startBookX,
        translationX,
        direction,
        pageWidth,
      );
      const fingerX = anchoredGestureFingerX(startBookX, currentBookX);
      const heldRollTilt = gestureLiftRotationForFingerX(fingerX);
      return {
        fingerX,
        heldRollTilt,
        pressedEdgeX: gesturePressedChordForFingerX(fingerX, heldRollTilt),
      };
    },
    renderProgress: ({ physicalProgress, direction, spreadMode }) => {
      'worklet';
      const progress = clampUnit(physicalProgress);
      return spreadMode === 'single' && direction === 1
        ? progress * 0.5
        : progress;
    },
    shouldCommit: ({ progress, towardTargetVelocity }) => {
      'worklet';
      return crossesPageTurnCommitThreshold(progress, towardTargetVelocity);
    },
  },
  native: {
    motion: NATIVE_CURL_MOTION_CONFIG,
    gesture: {
      minimumStartBookX: 0.25,
      minimumSpeedScale: 1,
      maximumSpeedScale: 2.2,
      velocityGain: 0.35,
      idleDecaySeconds: 0.08,
      canStart: (direction, startBookX) => {
        'worklet';
        return direction < 0 || startBookX >= 0.25;
      },
    },
  },
  motion: {
    getDuration: ({ incomingPageLanding }) => incomingPageLanding
      ? PAGE_TURN_REVERSE_DURATION_MS
      : PAGE_TURN_DURATION_MS,
    getSettleDuration: ({ fromProgress, targetProgress, releaseVelocity }) => {
      const distance = Math.abs(clampUnit(targetProgress) - clampUnit(fromProgress));
      const fullDuration = targetProgress === 0
        ? PAGE_TURN_REVERT_DURATION_MS
        : PAGE_TURN_GESTURE_SETTLE_DURATION_MS;
      const minimumDuration = targetProgress === 0 ? 220 : 160;
      const towardTarget = releaseVelocity * (targetProgress - fromProgress) > 0;
      const releaseSpeed = towardTarget ? Math.min(6, Math.abs(releaseVelocity)) : 0;
      const releaseBoost = Math.min(0.22, releaseSpeed * 0.035);
      return Math.max(
        minimumDuration,
        Math.round(fullDuration * distance * (1 - releaseBoost)),
      );
    },
    getAutomaticDuration: ({ incomingPageLanding }) => incomingPageLanding
      ? PAGE_TURN_REVERSE_DURATION_MS
      : PAGE_TURN_DURATION_MS,
    getEasing: ({ targetProgress, incomingPageLanding, interactive }) => {
      if (!interactive) return linear;
      if (targetProgress === 0) return easeOutCubic;
      return incomingPageLanding
        ? easeOutQuad
        : easeInOutSine;
    },
  },
  orchestration: {
    serializesAutomaticTurns: true,
    usesPlanarAutomaticTransition: false,
  },
};

function linear(progress: number): number {
  'worklet';
  return progress;
}

function easeOutCubic(progress: number): number {
  'worklet';
  return 1 - (1 - progress) ** 3;
}

function easeOutQuad(progress: number): number {
  'worklet';
  return 1 - (1 - progress) ** 2;
}

function easeInOutSine(progress: number): number {
  'worklet';
  return -(Math.cos(Math.PI * progress) - 1) / 2;
}
