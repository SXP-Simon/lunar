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

import type { ReaderRenderFrame, ReaderSnapshot } from '../../contracts';
import type { CompiledReaderPicture } from '../rendering/picture-compiler';
import { useCoverPageTransform } from './effect/cover';
import { useSlidePageTransforms } from './effect/slide';
import {
  getReaderPageTurnDuration,
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
  readonly style: 'cover' | 'page' | 'slide';
  readonly coverMatrix: DerivedValue<Matrix4>;
  readonly incomingSlideMatrix: DerivedValue<Matrix4>;
  readonly outgoingSlideMatrix: DerivedValue<Matrix4>;
  readonly progress: SharedValue<number>;
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
  readonly pressedEdgeX?: number;
  readonly pressedEdgeXValue?: SharedValue<number>;
  readonly heldRollTilt?: number;
  readonly heldRollTiltValue?: SharedValue<number>;
  readonly grabYValue?: SharedValue<number>;
  readonly fingerX?: number;
  readonly throwVelocity?: number;
  readonly throwAcceleration?: number;
}

export function useReaderPageTransition(
  current: ReaderPageContent | undefined,
  animationStyle: ReaderPageAnimationStyle = 'slide',
  animationDuration = 360,
  interactiveTurn?: ReaderInteractiveTurn,
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
  const automaticTransition = useMemo<ReaderPageTransitionState | undefined>(() => {
    if (
      interactiveContent
      || !current
      || !displayedContent
      || samePageIdentity(current.snapshot, interactiveCommit)
      || displayedContent.key === currentKey
      || displayedContent.frame.width !== current.frame.width
      || displayedContent.frame.height !== current.frame.height
      || displayedContent.snapshot.revisionId !== current.snapshot.revisionId
      || displayedContent.snapshot.spreadIndex === current.snapshot.spreadIndex
    ) {
      return undefined;
    }
    return {
      from: displayedContent,
      toKey: currentKey!,
      direction: current.snapshot.spreadIndex > displayedContent.snapshot.spreadIndex ? 1 : -1,
    };
  }, [current, currentKey, displayedContent, interactiveCommit, interactiveContent]);
  const activeTransition = interactiveTransition
    ?? (transition?.toKey === currentKey ? transition : undefined)
    ?? automaticTransition;
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayedContent(undefined);
      animatedProgress.set(1);
      return;
    }
    if (displayedContent?.key === current.key) return;

    const previous = displayedContent;
    setDisplayedContent(current);
    const sameSurface = previous
      && previous.frame.width === current.frame.width
      && previous.frame.height === current.frame.height
      && previous.snapshot.revisionId === current.snapshot.revisionId;
    if (sameSurface && previous.snapshot.spreadIndex !== current.snapshot.spreadIndex) {
      // Reuse the transition object that was already visible in this render
      // when the implicit transition guarded the snapshot handoff. This keeps
      // the composed SkPicture alive while React records the state update.
      setTransition(activeTransition ?? {
        from: previous,
        toKey: current.key,
        direction: current.snapshot.spreadIndex > previous.snapshot.spreadIndex ? 1 : -1,
      });
    } else {
      setTransition(undefined);
      animatedProgress.set(1);
    }
  }, [activeTransition, animatedProgress, current, currentKey, displayedContent, interactiveCommit, interactiveTurn, style]);

  useLayoutEffect(() => {
    if (!activeTransition || (interactiveTurn && !interactiveTurn.settling)) return;
    const target = interactiveTurn?.settleTo ?? 1;
    const duration = interactiveTurn
      ? getReaderPageTurnSettleDuration(
          animationStyle,
          interactiveTurn.progress,
          target,
          interactiveTurn.releaseVelocity,
          animationDuration,
        )
      : getReaderPageTurnDuration(animationStyle, 0, animationDuration);
    if (!interactiveTurn?.settling) animatedProgress.set(0);
    animatedProgress.set(withTiming(target, {
      duration,
      easing: target === 0
        ? Easing.out(Easing.cubic)
        : style === 'page'
          ? Easing.inOut(Easing.sin)
          : Easing.inOut(Easing.cubic),
    }, (finished) => {
      if (finished && !interactiveTurn) scheduleOnRN(clearTransition, activeTransition.toKey);
    }));
    return () => cancelAnimation(animatedProgress);
  }, [activeTransition, animatedProgress, animationDuration, animationStyle, clearTransition, interactiveTurn, style]);

  return {
    transition: activeTransition,
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
