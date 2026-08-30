import {
  Canvas,
  Group,
  Picture,
  Rect as SkiaRect,
  Text as SkiaText,
  useCanvasSize,
} from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

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
  /** Skia-owned reader chrome rendered in the same Canvas as the page. */
  readonly chapterTitle?: string;
  readonly progressLabel?: string;
  readonly overlayColor?: string;
  readonly overlayInsets?: Readonly<{ left: number; right: number }>;
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
  chapterTitle,
  progressLabel,
  overlayColor = '#777777',
  overlayInsets = { left: 0, right: 0 },
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
  const renderChrome = (
    chromeSnapshot: ReaderSnapshot,
    chromeFrame: { readonly width: number; readonly height: number },
    titleOverride?: string,
    progressOverride?: string,
  ): ReactNode => {
    const pageScale = Math.max(0.001, scale);
    const title = titleOverride ?? chromeSnapshot.chapterTitle;
    const progress = progressOverride ?? progressLabelForSnapshot(chromeSnapshot);
    const titleFont = title ? runtime.getUiFont(14 / pageScale) : undefined;
    const progressFont = progress ? runtime.getUiFont(12 / pageScale) : undefined;
    const chapterX = (overlayInsets.left + 18 - offsetX) / pageScale;
    const chapterY = (16 - offsetY) / pageScale;
    const progressWidth = progressFont && progress ? progressFont.getTextWidth(progress) : 0;
    const progressX = Math.max(
      chapterX,
      (viewport.width - overlayInsets.right - 18 - progressWidth * pageScale - offsetX) / pageScale,
    );
    const progressY = (Math.max(12, viewport.height - 12) - offsetY) / pageScale;
    const chapterClipWidth = Math.max(
      0,
      (viewport.width - overlayInsets.right - 18 - offsetX) / pageScale - chapterX,
    );
    if ((!title || !titleFont) && (!progress || !progressFont)) return null;
    return (
      <>
        {title && titleFont && (
          <Group clip={{ x: chapterX, y: (0 - offsetY) / pageScale, width: chapterClipWidth, height: 24 / pageScale }}>
            <SkiaText color={overlayColor} font={titleFont} text={title} x={chapterX} y={chapterY} />
          </Group>
        )}
        {progress && progressFont && chromeFrame.width > 0 && chromeFrame.height > 0 && (
          <SkiaText color={overlayColor} font={progressFont} text={progress} x={progressX} y={progressY} />
        )}
      </>
    );
  };
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
              {renderChrome(snapshot, frame, chapterTitle, progressLabel)}
              <PageCurlMesh
                direction={activeTransition.direction}
                gestureMode={interactiveTurn?.gestureMode}
                grabX={grabX}
                grabY={grabY}
                heldRollTilt={interactiveTurn?.heldRollTilt}
                height={activeTransition.from.frame.height}
                picture={activeTransition.from.picture}
                pressedEdgeX={interactiveTurn?.pressedEdgeX}
                progress={progress}
                width={activeTransition.from.frame.width}
              />
              <Group matrix={outgoingSlideMatrix}>
                {renderChrome(activeTransition.from.snapshot, activeTransition.from.frame)}
              </Group>
            </Group>
          ) : activeTransition && resolvedAnimationStyle === 'cover' ? (
            <Group>
              <Group>
                <Picture picture={activeTransition.from.picture.picture} />
                {renderChrome(activeTransition.from.snapshot, activeTransition.from.frame)}
              </Group>
              <Group matrix={coverMatrix}>
                <Picture key={currentKey} picture={compiled.picture} />
                {renderChrome(snapshot, frame, chapterTitle, progressLabel)}
              </Group>
            </Group>
          ) : activeTransition && resolvedAnimationStyle === 'slide' ? (
            <Group>
              <Group matrix={outgoingSlideMatrix}>
                <Picture picture={activeTransition.from.picture.picture} />
                {renderChrome(activeTransition.from.snapshot, activeTransition.from.frame)}
              </Group>
              <Group matrix={slideMatrix}>
                <Picture key={currentKey} picture={compiled.picture} />
                {renderChrome(snapshot, frame, chapterTitle, progressLabel)}
              </Group>
            </Group>
          ) : (
            <>
              <Picture key={currentKey} picture={compiled.picture} />
              {renderChrome(snapshot, frame, chapterTitle, progressLabel)}
            </>
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

function progressLabelForSnapshot(snapshot: ReaderSnapshot): string {
  const totalSpreads = snapshot.totalSpreads;
  const currentSpread = snapshot.bookSpreadIndex ?? snapshot.spreadIndex;
  const progressText = totalSpreads === undefined
    ? '页码计算中'
    : `${currentSpread + 1} / ${totalSpreads}`;
  if (totalSpreads === undefined) return progressText;
  const progressPercentage = Math.round((currentSpread / Math.max(totalSpreads - 1, 1)) * 100);
  return `${progressText} · ${progressPercentage}%`;
}
