import type { Matrix4 } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useSharedValue,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { ReaderRenderFrame, ReaderSnapshot } from '../../contracts';
import type { CompiledReaderPicture } from '../rendering/picture-compiler';
import { useCoverPageTransform } from './page-cover-transition';
import { useSlidePageTransforms } from './page-slide-transition';

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
  readonly slideMatrix: DerivedValue<Matrix4>;
  readonly outgoingSlideMatrix: DerivedValue<Matrix4>;
  readonly progress: SharedValue<number>;
  readonly grabX: number;
  readonly grabY: number;
}

export interface ReaderInteractiveTurn {
  readonly content: ReaderPageContent;
  readonly progress: number;
  readonly grabX?: number;
  readonly grabY?: number;
  /** Normalized release speed in page-widths per second. */
  readonly releaseVelocity?: number;
  /** Set while the finger release is being animated to its terminal pose. */
  readonly settling?: boolean;
  readonly settleTo?: 0 | 1;
  readonly gestureMode?: 'full' | 'weak';
  readonly pressedEdgeX?: number;
  readonly heldRollTilt?: number;
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
  const interactiveCommitSpread = useRef<number | undefined>(undefined);
  const [transition, setTransition] = useState<ReaderPageTransitionState>();
  const progress = useSharedValue(1);
  const style = resolveAnimationStyle(animationStyle);
  const currentKey = current?.key;
  const interactiveTransition = interactiveTurn && displayedContent
    ? {
        from: displayedContent,
        toKey: interactiveTurn.content.key,
        direction: interactiveTurn.content.snapshot.spreadIndex > displayedContent.snapshot.spreadIndex ? 1 : -1,
      } satisfies ReaderPageTransitionState
    : undefined;
  const activeTransition = interactiveTransition ?? (transition?.toKey === currentKey ? transition : undefined);
  const clearTransition = useCallback((key: string) => {
    setTransition((value) => value?.toKey === key ? undefined : value);
  }, []);
  const direction = activeTransition?.direction ?? 1;
  const width = current?.frame.width ?? 0;
  const height = current?.frame.height ?? 0;
  const grabX = interactiveTurn?.grabX ?? (direction > 0 ? 0 : width);
  const grabY = interactiveTurn?.grabY ?? height / 2;
  const coverMatrix = useCoverPageTransform(direction, width, progress);
  const slideTransforms = useSlidePageTransforms(direction, width, progress);
  const slideMatrix = slideTransforms.incoming;
  const outgoingSlideMatrix = slideTransforms.outgoing;
  useEffect(() => {
    if (interactiveTurn) {
      interactiveCommitSpread.current = interactiveTurn.content.snapshot.spreadIndex;
      progress.set(Math.min(1, Math.max(0, interactiveTurn.progress)));
      return;
    }
    if (
      current &&
      current.snapshot.spreadIndex === interactiveCommitSpread.current &&
      current.snapshot.spreadIndex !== displayedContent?.snapshot.spreadIndex
    ) {
      setDisplayedContent(current);
      interactiveCommitSpread.current = undefined;
      setTransition(undefined);
      progress.set(1);
      return;
    }
    if (current && current.snapshot.spreadIndex === displayedContent?.snapshot.spreadIndex) {
      interactiveCommitSpread.current = undefined;
    }
    if (!current) {
      // The surface has no drawable content during loading/reflow; clear the
      // retained page before the next ready frame is considered.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayedContent(undefined);
      progress.set(1);
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
      setTransition({
        from: previous,
        toKey: current.key,
        direction: current.snapshot.spreadIndex > previous.snapshot.spreadIndex ? 1 : -1,
      });
    } else {
      setTransition(undefined);
      progress.set(1);
    }
  }, [current, currentKey, displayedContent, interactiveTurn, progress, style]);

  useEffect(() => {
    if (!activeTransition || (interactiveTurn && !interactiveTurn.settling)) return;
    const target = interactiveTurn?.settleTo ?? 1;
    const releaseSpeed = Math.min(6, Math.max(0, interactiveTurn?.releaseVelocity ?? 0));
    const releaseBoost = Math.min(style === 'page' ? 0.25 : 0.55, releaseSpeed * 0.08);
    const baseDuration = style === 'page'
      ? Math.max(1320, clampDuration(animationDuration))
      : clampDuration(animationDuration);
    const duration = Math.max(140, Math.round(baseDuration * (1 - releaseBoost)));
    if (!interactiveTurn?.settling) progress.set(0);
    progress.set(withTiming(target, {
      duration,
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished && !interactiveTurn) runOnJS(clearTransition)(activeTransition.toKey);
    }));
    return () => cancelAnimation(progress);
  }, [activeTransition, animationDuration, clearTransition, interactiveTurn, progress, style]);

  return { transition: activeTransition, style, coverMatrix, slideMatrix, outgoingSlideMatrix, progress, grabX, grabY };
}

function resolveAnimationStyle(style: ReaderPageAnimationStyle): 'cover' | 'page' | 'slide' {
  if (style === 'overlay') return 'cover';
  if (style === 'pageCurl' || style === 'simulation') return 'page';
  return style;
}

function clampDuration(value: number): number {
  return Number.isFinite(value) ? Math.min(1200, Math.max(120, Math.round(value))) : 360;
}
