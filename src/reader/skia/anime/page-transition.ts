import type { Matrix4 } from '@shopify/react-native-skia';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ReaderRenderFrame, ReaderSnapshot, ReaderSpreadMode } from '../../contracts';
import type { CompiledReaderPicture } from '../rendering/picture-compiler';
import { useCoverPageTransform } from './effect/cover';
import { useSlidePageTransforms } from './effect/slide';
import {
  getReaderPageTurnDuration,
  getReaderPageTurnHandoffProgress,
  getReaderPageTurnSettleDuration,
  resolveReaderPageAnimationStyle,
} from './page-turn-timing';

export type ReaderPageAnimationStyle =
  | 'cover'
  | 'page'
  | 'slide'
  | 'overlay'
  | 'pageCurl'
  | 'simulation';

export const READER_PAGE_ANIMATION_STYLES: readonly ReaderPageAnimationStyle[] = [
  'cover',
  'page',
  'slide',
];

export interface ReaderPageContent {
  readonly key: string;
  readonly snapshot: ReaderSnapshot;
  readonly picture: CompiledReaderPicture;
  readonly frame: ReaderRenderFrame;
}

export interface ReaderPageTransitionState {
  readonly from: ReaderPageContent;
  readonly toKey: string;
  readonly direction: 1 | -1;
}

interface ReaderPageTransitionValues {
  readonly transition?: ReaderPageTransitionState;
  readonly visibleContent?: ReaderPageContent;
  readonly style: 'cover' | 'page' | 'slide';
  readonly coverMatrix: DerivedValue<Matrix4>;
  readonly incomingSlideMatrix: DerivedValue<Matrix4>;
  readonly outgoingSlideMatrix: DerivedValue<Matrix4>;
  readonly progress: SharedValue<number> | DerivedValue<number>;
  readonly grabX: number;
  readonly grabY: number;
}

interface ReaderPageIdentity {
  readonly revisionId: number;
  readonly spreadIndex: number;
  readonly renderId?: number;
}

export interface ReaderInteractiveTurn {
  readonly content: ReaderPageContent;
  readonly direction: 1 | -1;
  readonly progress: number;
  /** Shared value updated by the gesture without a React render. */
  readonly progressValue?: SharedValue<number>;
  readonly grabX?: number;
  readonly grabY?: number;
  /** Signed release speed in page-widths per second; positive points toward the target. */
  readonly releaseVelocity?: number;
  /** Set while the finger release is being animated to its terminal pose. */
  readonly settling?: boolean;
  readonly settleTo?: 0 | 1;
  /** Runs on the RN runtime after the UI timing animation reaches its target. */
  readonly onSettleComplete?: () => void;
  readonly pressedEdgeX?: number;
  readonly pressedEdgeXValue?: SharedValue<number>;
  readonly heldRollTilt?: number;
  readonly heldRollTiltValue?: SharedValue<number>;
  readonly grabYValue?: SharedValue<number>;
  readonly fingerX?: number;
  readonly throwVelocity?: number;
  readonly throwAcceleration?: number;
  readonly nativeGesture?: ReaderNativeGestureState;
}

export interface ReaderNativeGestureState {
  readonly token: number;
  readonly preparedTurnId: number;
  readonly driven: boolean;
  readonly settling: boolean;
  readonly consumed: boolean;
}

export interface ReaderAutomaticTurn {
  readonly id: number;
  readonly from: ReaderPageContent;
  readonly to: ReaderPageContent;
  readonly direction: 1 | -1;
}

export function useReaderPageTransition(
  current: ReaderPageContent | undefined,
  animationStyle: ReaderPageAnimationStyle = 'slide',
  animationDuration = 360,
  interactiveTurn?: ReaderInteractiveTurn,
  spreadMode: ReaderSpreadMode = 'double',
  suppressAutomaticTransition = false,
): ReaderPageTransitionValues {
  const [displayedContent, setDisplayedContent] = useState<ReaderPageContent>();
  const [interactiveCommit, setInteractiveCommit] = useState<ReaderPageIdentity>();
  const [transition, setTransition] = useState<ReaderPageTransitionState>();
  const progress = useSharedValue(1);
  const animatedProgress = interactiveTurn?.progressValue ?? progress;
  const style = resolveReaderPageAnimationStyle(animationStyle);
  const currentKey = current?.key;
  const interactiveContent = interactiveTurn?.content;
  const interactiveTargetSpread = interactiveContent?.snapshot.spreadIndex;
  const interactiveTransition = useMemo<ReaderPageTransitionState | undefined>(() => interactiveContent && displayedContent
    ? {
        from: displayedContent,
        toKey: interactiveContent.key,
        direction: interactiveTurn?.direction
          ?? ((interactiveTargetSpread ?? displayedContent.snapshot.spreadIndex) > displayedContent.snapshot.spreadIndex ? 1 : -1),
    }
    : undefined, [displayedContent, interactiveContent, interactiveTargetSpread, interactiveTurn?.direction]);
  const activeTransition = interactiveTransition
    ?? (transition?.toKey === currentKey ? transition : undefined);
  const visibleContent = interactiveContent
    ?? (activeTransition ? current : displayedContent ?? current);
  const incomingPageLanding = style === 'page'
    && spreadMode === 'single'
    && activeTransition?.direction === -1;
  const clearTransition = useCallback((key: string) => {
    setTransition((value) => value?.toKey === key ? undefined : value);
  }, []);
  const direction = activeTransition?.direction ?? 1;
  const transitionFrame = current?.frame ?? displayedContent?.frame ?? interactiveContent?.frame;
  const width = transitionFrame?.width ?? 0;
  const height = transitionFrame?.height ?? 0;
  const grabX = interactiveTurn?.grabX ?? (direction > 0 ? 0 : width);
  const grabY = interactiveTurn?.grabY ?? height / 2;
  const coverMatrix = useCoverPageTransform(direction, width, animatedProgress);
  const slideTransforms = useSlidePageTransforms(direction, width, animatedProgress);
  const incomingSlideMatrix = slideTransforms.incoming;
  const outgoingSlideMatrix = slideTransforms.outgoing;
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (interactiveTurn) {
      const targetIdentity: ReaderPageIdentity = {
        revisionId: interactiveTurn.content.snapshot.revisionId,
        spreadIndex: interactiveTurn.content.snapshot.spreadIndex,
        renderId: interactiveTurn.content.snapshot.renderId,
      };
      if (!samePageIdentity(targetIdentity, interactiveCommit)) {
        setInteractiveCommit(targetIdentity);
      }
      // During release the timing driver owns the shared value. Writing the
      // last React gesture sample here would jump the curl backwards whenever
      // the runtime publishes its committed snapshot.
      if (!interactiveTurn.settling && !interactiveTurn.progressValue) {
        animatedProgress.set(Math.min(1, Math.max(0, interactiveTurn.progress)));
      }
      return;
    }
    if (
      current &&
      samePageIdentity(current.snapshot, interactiveCommit) &&
      current.key !== displayedContent?.key
    ) {
      setDisplayedContent(current);
      setInteractiveCommit(undefined);
      setTransition(undefined);
      animatedProgress.set(1);
      return;
    }
    if (interactiveCommit && current?.key === displayedContent?.key) {
      setInteractiveCommit(undefined);
    }
    if (!current) {
      // The surface has no drawable content during loading/reflow; clear the
      // retained page before the next ready frame is considered.
      setDisplayedContent(undefined);
      animatedProgress.set(1);
      return;
    }
    if (displayedContent?.key === current.key) return;

    if (suppressAutomaticTransition) {
      setDisplayedContent(current);
      setTransition(undefined);
      animatedProgress.set(1);
      return;
    }

    const previous = displayedContent;
    setDisplayedContent(current);
    const sameSurface = previous
      && previous.frame.width === current.frame.width
      && previous.frame.height === current.frame.height
      && previous.snapshot.revisionId === current.snapshot.revisionId;
    if (sameSurface && previous.snapshot.spreadIndex !== current.snapshot.spreadIndex) {
      // Establish the start pose before publishing the transition tree. The
      // previous page remains visible during this render, so Skia never sees
      // the target page at its completed pose before the animation begins.
      animatedProgress.set(0);
      setTransition({
        from: previous,
        toKey: current.key,
        direction: current.snapshot.spreadIndex > previous.snapshot.spreadIndex ? 1 : -1,
      });
    } else {
      setTransition(undefined);
      animatedProgress.set(1);
    }
  }, [animatedProgress, current, displayedContent, interactiveCommit, interactiveTurn, suppressAutomaticTransition]);

  /* eslint-enable react-hooks/set-state-in-effect */

  useLayoutEffect(() => {
    if (
      !activeTransition
      || (interactiveTurn && (
        !interactiveTurn.settling
        || interactiveTurn.nativeGesture?.driven
      ))
    ) return;
    const handoffProgress = getReaderPageTurnHandoffProgress(
      interactiveTurn?.settling === true,
      interactiveTurn?.settleTo,
    );
    const target = handoffProgress ?? 1;
    const duration = interactiveTurn
      ? getReaderPageTurnSettleDuration(
          animationStyle,
          interactiveTurn.progress,
          target,
          interactiveTurn.releaseVelocity,
          animationDuration,
        )
      : getReaderPageTurnDuration(
          animationStyle,
          0,
          animationDuration,
          incomingPageLanding,
        );
    // React Skia can observe the driver swap before it removes the interactive
    // nodes. Keep both drivers at the same terminal pose during that frame.
    if (handoffProgress !== undefined) progress.set(handoffProgress);
    if (!interactiveTurn?.settling && animatedProgress.value !== 0) {
      animatedProgress.set(0);
    }
    animatedProgress.set(withTiming(target, {
      duration,
      easing: !interactiveTurn && style === 'page'
        ? Easing.linear
        : target === 0
        ? Easing.out(Easing.cubic)
        : incomingPageLanding
          ? Easing.out(Easing.quad)
          : style === 'page'
            ? Easing.inOut(Easing.sin)
            : Easing.inOut(Easing.cubic),
    }, (finished) => {
      if (!finished) return;
      if (interactiveTurn?.settling && interactiveTurn.onSettleComplete) {
        scheduleOnRN(interactiveTurn.onSettleComplete);
      } else if (!interactiveTurn) {
        scheduleOnRN(clearTransition, activeTransition.toKey);
      }
    }));
    return () => cancelAnimation(animatedProgress);
  }, [activeTransition, animatedProgress, animationDuration, animationStyle, clearTransition, incomingPageLanding, interactiveTurn, progress, style]);

  return {
    transition: activeTransition,
    visibleContent,
    style,
    coverMatrix,
    incomingSlideMatrix,
    outgoingSlideMatrix,
    progress: animatedProgress,
    grabX,
    grabY,
  };
}

function samePageIdentity(
  left: ReaderPageIdentity | undefined,
  right: ReaderPageIdentity | undefined,
): boolean {
  return Boolean(
    left
    && right
    && left.revisionId === right.revisionId
    && left.spreadIndex === right.spreadIndex
    && left.renderId === right.renderId,
  );
}
