import { Canvas, Group, Picture, Rect as SkiaRect, useCanvasSize } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';
import { useEffect } from 'react';

import type { ReaderSnapshot } from '../../contracts';
import type { LunarReaderRuntime } from '../../runtime/core/native-reader-runtime';
import { readerPerformanceMark } from '../../runtime/core/performance';
import {
  PageCurlMesh,
  useReaderPageTransition,
  type ReaderPageAnimationStyle,
  type ReaderPageContent,
  type ReaderInteractiveTurn,
} from '../anime';
import type { ReaderOverlayRect } from './overlay-renderer';
import { createReaderSurfaceTransform, type ReaderSurfaceTransform } from './surface-transform';

export type { ReaderSurfaceTransform } from './surface-transform';
export { READER_PAGE_ANIMATION_STYLES } from '../anime';
export type { ReaderInteractiveTurn, ReaderPageAnimationStyle, ReaderPageContent } from '../anime';

export interface ReaderSurfaceProps {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly style?: StyleProp<ViewStyle>;
  readonly overlays?: readonly ReaderOverlayRect[];
  readonly onTransformChange?: (transform: ReaderSurfaceTransform) => void;
  /** Defaults to `slide`, which keeps the page content legible throughout the turn. */
  readonly animationStyle?: ReaderPageAnimationStyle;
  /** Duration in milliseconds for a page turn. */
  readonly animationDuration?: number;
  /** Optional finger-controlled turn. The target picture must be prepared first. */
  readonly interactiveTurn?: ReaderInteractiveTurn;
}

export function ReaderSurface({
  runtime,
  snapshot,
  style,
  overlays = [],
  onTransformChange,
  animationStyle = 'slide',
  animationDuration = 360,
  interactiveTurn,
}: ReaderSurfaceProps) {
  const { ref, size: viewport } = useCanvasSize();
  const compiled = snapshot.phase === 'ready'
    ? runtime.getCurrentPicture(snapshot.revisionId, snapshot.spreadIndex, snapshot.renderId)
    : undefined;
  const frame = snapshot.phase === 'ready'
    ? runtime.getCurrentFrame(snapshot.spreadIndex)
    : undefined;
  const scale = frame && viewport.width > 0 && viewport.height > 0
    ? Math.min(viewport.width / frame.width, viewport.height / frame.height)
    : 1;
  const offsetX = frame ? (viewport.width - frame.width * scale) / 2 : 0;
  const offsetY = frame ? (viewport.height - frame.height * scale) / 2 : 0;
  const currentKey = snapshot.phase === 'ready' && compiled && frame
    ? `${snapshot.revisionId}:${snapshot.spreadIndex}:${snapshot.renderId ?? 0}`
    : undefined;
  const currentContent: ReaderPageContent | undefined = currentKey && compiled && frame
    ? { key: currentKey, snapshot, picture: compiled, frame }
    : undefined;
  const { transition: activeTransition, style: resolvedAnimationStyle, coverMatrix, slideMatrix, outgoingSlideMatrix, progress, grabX, grabY } =
    useReaderPageTransition(currentContent, animationStyle, animationDuration, interactiveTurn);

  useEffect(() => {
    onTransformChange?.(createReaderSurfaceTransform(scale, offsetX, offsetY));
  }, [offsetX, offsetY, onTransformChange, scale]);

  const canRenderFrame = compiled !== undefined && frame !== undefined && snapshot.phase === 'ready';
  if (canRenderFrame) {
    readerPerformanceMark('reader.canvas.render', `spread=${snapshot.spreadIndex}`);
  }

  return (
    <Canvas
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      ref={ref}
      style={style}>
      {canRenderFrame && (
        <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale }]}>
          {activeTransition && resolvedAnimationStyle === 'page' ? (
            <Group>
              <Picture key={currentKey} picture={compiled.picture} />
              <PageCurlMesh
                direction={activeTransition.direction}
                grabX={grabX}
                grabY={grabY}
                height={activeTransition.from.frame.height}
                picture={activeTransition.from.picture}
                progress={progress}
                width={activeTransition.from.frame.width}
              />
            </Group>
          ) : activeTransition && resolvedAnimationStyle === 'cover' ? (
            <Group>
              <Picture picture={activeTransition.from.picture.picture} />
              <Group matrix={coverMatrix}>
                <Picture key={currentKey} picture={compiled.picture} />
              </Group>
            </Group>
          ) : activeTransition && resolvedAnimationStyle === 'slide' ? (
            <Group>
              <Group matrix={outgoingSlideMatrix}>
                <Picture picture={activeTransition.from.picture.picture} />
              </Group>
              <Group matrix={slideMatrix}>
                <Picture key={currentKey} picture={compiled.picture} />
              </Group>
            </Group>
          ) : (
            <Picture key={currentKey} picture={compiled.picture} />
          )}
          {!activeTransition && overlays.filter((overlay) => overlay.revisionId === undefined || overlay.revisionId === snapshot.revisionId).map((overlay, index) => (
            <SkiaRect
              key={`${index}:${overlay.bounds.x}:${overlay.bounds.y}`}
              x={overlay.bounds.x}
              y={overlay.bounds.y}
              width={overlay.bounds.width}
              height={overlay.bounds.height}
              color={overlay.color}
              style={overlay.outline ? 'stroke' : 'fill'}
              strokeWidth={overlay.thickness ?? 1}
            />
          ))}
        </Group>
      )}
    </Canvas>
  );
}
