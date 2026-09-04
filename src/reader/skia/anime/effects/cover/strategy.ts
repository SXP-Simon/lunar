import type { ReaderPageTurnEffect } from '../../core/page-turn-effect';
import {
  clampUnit,
  crossesPageTurnCommitThreshold,
  getPlanarAutomaticPageTurnDuration,
  getPlanarPageTurnDuration,
  getPlanarPageTurnSettleDuration,
} from '../../core/page-turn-math';

export const coverPageTurnEffect: ReaderPageTurnEffect = {
  style: 'cover',
  visual: {
    kind: 'cover',
    isIncomingPageLanding: () => false,
    getPrimaryTransform: ({ direction, width, progress }) => {
      'worklet';
      const originX = direction > 0 ? width : 0;
      const scaleX = Math.max(0.001, progress);
      return [
        { translateX: originX },
        { scaleX },
        { translateX: -originX },
      ];
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
    getStartBookX: (localX, direction, pageWidth) => {
      'worklet';
      const normalized = clampUnit(localX / Math.max(1, pageWidth));
      return direction === 1 ? normalized : 1 - normalized;
    },
    getGeometry: ({ translationX, direction, pageWidth }) => {
      'worklet';
      const distance = direction === 1 ? -translationX : translationX;
      return {
        fingerX: 1 - clampUnit(distance / Math.max(1, pageWidth)),
        heldRollTilt: 0,
        pressedEdgeX: 1,
      };
    },
    renderProgress: ({ physicalProgress }) => {
      'worklet';
      return clampUnit(physicalProgress);
    },
    shouldCommit: ({ progress, towardTargetVelocity }) => {
      'worklet';
      return crossesPageTurnCommitThreshold(progress, towardTargetVelocity);
    },
  },
  motion: {
    getDuration: ({ releaseVelocity, animationDuration }) =>
      getPlanarPageTurnDuration(releaseVelocity, animationDuration),
    getSettleDuration: ({
      fromProgress,
      targetProgress,
      releaseVelocity,
      animationDuration,
    }) => getPlanarPageTurnSettleDuration(
      fromProgress,
      targetProgress,
      releaseVelocity,
      animationDuration,
    ),
    getAutomaticDuration: ({ queuedTurnCount, fromProgress, animationDuration }) =>
      getPlanarAutomaticPageTurnDuration(
        queuedTurnCount,
        fromProgress,
        getPlanarPageTurnDuration(0, animationDuration),
      ),
    getEasing: ({ targetProgress }) => targetProgress === 0
      ? easeOutCubic
      : easeInOutSine,
  },
  orchestration: {
    serializesAutomaticTurns: false,
    usesPlanarAutomaticTransition: true,
  },
};

function easeOutCubic(progress: number): number {
  'worklet';
  return 1 - (1 - progress) ** 3;
}

function easeInOutSine(progress: number): number {
  'worklet';
  return -(Math.cos(Math.PI * progress) - 1) / 2;
}
