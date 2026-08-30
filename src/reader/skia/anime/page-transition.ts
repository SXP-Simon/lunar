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
  readonly pageMatrix: DerivedValue<Matrix4>;
}

export function useReaderPageTransition(
  current: ReaderPageContent | undefined,
  animationStyle: ReaderPageAnimationStyle = 'slide',
  animationDuration = 360,
): ReaderPageTransitionValues {
  const displayedContent = useRef<ReaderPageContent | undefined>(undefined);
  const [transition, setTransition] = useState<ReaderPageTransitionState>();
  const progress = useSharedValue(1);
  const style = resolveAnimationStyle(animationStyle);
  const currentKey = current?.key;
  const activeTransition = transition?.toKey === currentKey ? transition : undefined;
  const clearTransition = useCallback((key: string) => {
    setTransition((value) => value?.toKey === key ? undefined : value);
  }, []);
  const direction = activeTransition?.direction ?? 1;
  const width = current?.frame.width ?? 0;
  const height = current?.frame.height ?? 0;
  const coverMatrix = useDerivedValue(() => {
    const originX = direction > 0 ? width : 0;
    const scaleX = Math.max(0.001, progress.value);
    return processTransform3d([
      { translateX: originX },
      { scaleX },
      { translateX: -originX },
    ]);
  }, [direction, width]);
  const slideMatrix = useDerivedValue(
    () => processTransform3d([{ translateX: direction * width * (1 - progress.value) }]),
    [direction, width],
  );
  const pageMatrix = useDerivedValue(() => {
    const originX = direction > 0 ? 0 : width;
    const originY = height / 2;
    const angle = direction * (Math.PI / 2) * (1 - progress.value);
    return processTransform3d([
      { translateX: originX },
      { translateY: originY },
      { perspective: 900 },
      { rotateY: angle },
      { translateX: -originX },
      { translateY: -originY },
    ]);
  }, [direction, width, height]);

  useEffect(() => {
    if (!current) {
      displayedContent.current = undefined;
      progress.set(1);
      return;
    }
    if (displayedContent.current?.key === current.key) return;

    const previous = displayedContent.current;
    displayedContent.current = current;
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
  }, [current, currentKey, progress, style]);

  useEffect(() => {
    if (!activeTransition) return;
    progress.set(0);
    progress.set(withTiming(1, {
      duration: clampDuration(animationDuration),
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(clearTransition)(activeTransition.toKey);
    }));
    return () => cancelAnimation(progress);
  }, [activeTransition, animationDuration, clearTransition, progress]);

  return { transition: activeTransition, style, coverMatrix, slideMatrix, pageMatrix };
}

function resolveAnimationStyle(style: ReaderPageAnimationStyle): 'cover' | 'page' | 'slide' {
  if (style === 'overlay') return 'cover';
  if (style === 'pageCurl' || style === 'simulation') return 'page';
  return style;
}

function clampDuration(value: number): number {
  return Number.isFinite(value) ? Math.min(1200, Math.max(120, Math.round(value))) : 360;
}
