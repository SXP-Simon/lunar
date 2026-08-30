import { processTransform3d, type Matrix4 } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { ReaderRenderFrame, ReaderSnapshot } from '../../contracts';
import type { CompiledReaderPicture } from '../rendering/picture-compiler';

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
  const coverMatrix = useDerivedValue(() => {
    const originX = direction > 0 ? width : 0;
    const scaleX = Math.max(0.001, progress.value);
    return processTransform3d([
      { translateX: originX },
      { scaleX },
      { translateX: -originX },
    ]);
  }, [direction, width]);
  // Keep animated matrices as top-level Skia props. ReanimatedRecorder tracks
  // those shared values safely; nested values inside `transform` arrays are
  // interpreted as ordinary numbers by the native recorder.
  const slideMatrix = useDerivedValue(
    () => processTransform3d([{ translateX: direction * width * (1 - progress.value) }]),
    [direction, width],
  );
  const outgoingSlideMatrix = useDerivedValue(
    () => processTransform3d([{ translateX: -direction * width * progress.value }]),
    [direction, width],
  );
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
    if (!activeTransition || interactiveTurn) return;
    progress.set(0);
    progress.set(withTiming(1, {
      duration: clampDuration(animationDuration),
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(clearTransition)(activeTransition.toKey);
    }));
    return () => cancelAnimation(progress);
  }, [activeTransition, animationDuration, clearTransition, interactiveTurn, progress]);

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
