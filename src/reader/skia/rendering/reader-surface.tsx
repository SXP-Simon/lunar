import {
  Canvas,
  ClipOp,
  Group,
  Picture,
  Rect as SkiaRect,
  Skia,
  Text as SkiaText,
  type SkFont,
  type SkPicture,
  useCanvasSize,
} from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';
import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { ReaderSnapshot } from '../../contracts';
import type { LunarReaderRuntime } from '../../runtime/core/native-reader-runtime';
import { readerDiagnostic, readerPerformanceMark } from '../../runtime/core/performance';
import {
  PageCurlMesh,
  SlidePageEdgeShadow,
  useReaderPageTransition,
  usePageCurlTexture,
  type ReaderPageAnimationStyle,
  type ReaderPageContent,
  type ReaderInteractiveTurn,
} from '../anime';
import type { ReaderOverlayRect } from './overlay-renderer';
import { createReaderSurfaceTransform, type ReaderSurfaceTransform } from './surface-transform';

export type { ReaderSurfaceTransform } from './surface-transform';
export { PAGE_TURN_DURATION_MS, READER_PAGE_ANIMATION_STYLES } from '../anime';
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
  const overlayLeft = overlayInsets.left;
  const overlayRight = overlayInsets.right;
  const offsetX = frame ? (viewport.width - frame.width * scale) / 2 : 0;
  const offsetY = frame ? (viewport.height - frame.height * scale) / 2 : 0;
  const currentKey = snapshot.phase === 'ready' && compiled && frame
    ? `${snapshot.revisionId}:${snapshot.spreadIndex}:${snapshot.renderId ?? 0}`
    : undefined;
  const currentContent = useMemo<ReaderPageContent | undefined>(
    () => currentKey && compiled && frame
      ? { key: currentKey, snapshot, picture: compiled, frame }
      : undefined,
    [compiled, currentKey, frame, snapshot],
  );
  // During a drag the runtime snapshot intentionally remains on the source
  // spread until release. The prepared interactive content is therefore the
  // only valid picture for the incoming layer.
  const incomingContent = interactiveTurn?.content ?? currentContent;
  const incomingPicture = incomingContent?.picture.picture ?? compiled?.picture;
  const incomingSnapshot = incomingContent?.snapshot ?? snapshot;
  const incomingFrame = incomingContent?.frame ?? frame;
  const incomingKey = incomingContent?.key ?? currentKey;
  const {
    transition: activeTransition,
    style: resolvedAnimationStyle,
    coverMatrix,
    incomingSlideMatrix,
    outgoingSlideMatrix,
    progress,
    grabX,
    grabY,
  } =
    useReaderPageTransition(currentContent, animationStyle, animationDuration, interactiveTurn);

  useEffect(() => {
    readerDiagnostic(
      'turn.surface.state',
      [
        `snapshot=${snapshot.revisionId}:${snapshot.spreadIndex}:${snapshot.renderId ?? 'none'}`,
        `current=${currentKey ?? 'none'}`,
        `incoming=${incomingKey ?? 'none'}`,
        `from=${activeTransition?.from.key ?? 'none'}`,
        `to=${activeTransition?.toKey ?? 'none'}`,
        `mode=${activeTransition ? resolvedAnimationStyle : 'static'}`,
        `interactive=${String(Boolean(interactiveTurn))}`,
        `settling=${String(interactiveTurn?.settling === true)}`,
        `picture=${String(Boolean(incomingPicture))}`,
        `frame=${String(Boolean(incomingFrame))}`,
      ].join(' '),
    );
  }, [
    activeTransition?.from.key,
    activeTransition?.toKey,
    currentKey,
    incomingFrame,
    incomingKey,
    incomingPicture,
    interactiveTurn,
    resolvedAnimationStyle,
    snapshot.renderId,
    snapshot.revisionId,
    snapshot.spreadIndex,
  ]);

  // The moving sheet owns its chrome. Recording it into the same source
  // picture prevents a footer or chapter title from travelling on a separate
  // linear transform while the paper follows the curl profile.
  const pageCurlSource = resolvedAnimationStyle === 'page'
    ? activeTransition?.from ?? currentContent
    : undefined;
  const pageCurlProgressText = pageCurlSource
    ? progressLabelForSnapshot(pageCurlSource.snapshot)
    : undefined;
  const pageCurlTexturePicture = useMemo(() => {
    if (!pageCurlSource || !pageCurlProgressText) return undefined;
    const source = pageCurlSource;
    const pageScale = Math.max(0.001, scale);
    const title = source.snapshot.chapterTitle;
    const titleFont = title ? runtime.getUiFont(14 / pageScale) : undefined;
    const progressFont = runtime.getUiFont(12 / pageScale);
    if ((!title || !titleFont) && !progressFont) return undefined;
    return composePageCurlPicture({
      base: source.picture.picture,
      color: overlayColor,
      height: source.frame.height,
      offsetX,
      offsetY,
      pageScale,
      progress: pageCurlProgressText,
      progressFont,
      title,
      titleFont,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
      width: source.frame.width,
      overlayInsets: { left: overlayLeft, right: overlayRight },
    });
  }, [
    offsetX,
    offsetY,
    overlayColor,
    overlayLeft,
    overlayRight,
    pageCurlProgressText,
    pageCurlSource,
    runtime,
    scale,
    viewport.height,
    viewport.width,
  ]);
  const pageCurlTexture = usePageCurlTexture(
    pageCurlTexturePicture ?? pageCurlSource?.picture.picture,
    pageCurlSource?.frame.width ?? 0,
    pageCurlSource?.frame.height ?? 0,
  );

  useEffect(() => () => pageCurlTexturePicture?.dispose(), [pageCurlTexturePicture]);

  useEffect(() => {
    onTransformChange?.(createReaderSurfaceTransform(scale, offsetX, offsetY));
  }, [offsetX, offsetY, onTransformChange, scale]);

  const canRenderFrame = snapshot.phase === 'ready'
    && ((compiled !== undefined && frame !== undefined) || activeTransition !== undefined);
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
              {incomingPicture && <Picture key={incomingKey} picture={incomingPicture} />}
              {incomingFrame && renderChrome(incomingSnapshot, incomingFrame, chapterTitle, interactiveTurn ? undefined : progressLabel)}
              <PageCurlMesh
                key={activeTransition.from.key}
                direction={activeTransition.direction}
                grabX={grabX}
                grabY={grabY}
                grabYValue={interactiveTurn?.grabYValue}
                heldRollTilt={interactiveTurn?.heldRollTilt}
                heldRollTiltValue={interactiveTurn?.heldRollTiltValue}
                height={activeTransition.from.frame.height}
                initialProgress={interactiveTurn?.progress}
                picture={activeTransition.from.picture}
                pressedEdgeX={interactiveTurn?.pressedEdgeX}
                pressedEdgeXValue={interactiveTurn?.pressedEdgeXValue}
                progress={progress}
                texture={pageCurlTexture}
                texturePicture={pageCurlTexturePicture}
                width={activeTransition.from.frame.width}
              />
            </Group>
          ) : activeTransition && resolvedAnimationStyle === 'cover' ? (
            <Group>
              <Group>
                <Picture picture={activeTransition.from.picture.picture} />
                {renderChrome(activeTransition.from.snapshot, activeTransition.from.frame)}
              </Group>
              <Group matrix={coverMatrix}>
                {incomingPicture && <Picture key={incomingKey} picture={incomingPicture} />}
                {incomingFrame && renderChrome(incomingSnapshot, incomingFrame, chapterTitle, interactiveTurn ? undefined : progressLabel)}
              </Group>
            </Group>
          ) : activeTransition && resolvedAnimationStyle === 'slide' ? (
            <Group>
              <Group matrix={incomingSlideMatrix}>
                {incomingPicture && <Picture key={incomingKey} picture={incomingPicture} />}
                {incomingFrame && renderChrome(incomingSnapshot, incomingFrame, chapterTitle, interactiveTurn ? undefined : progressLabel)}
              </Group>
              <Group matrix={outgoingSlideMatrix}>
                <Picture picture={activeTransition.from.picture.picture} />
                {renderChrome(activeTransition.from.snapshot, activeTransition.from.frame)}
                <SlidePageEdgeShadow
                  direction={activeTransition.direction}
                  width={activeTransition.from.frame.width}
                  height={activeTransition.from.frame.height}
                />
              </Group>
            </Group>
          ) : (
            <>
              {incomingPicture && <Picture key={incomingKey} picture={incomingPicture} />}
              {incomingFrame && renderChrome(incomingSnapshot, incomingFrame, chapterTitle, interactiveTurn ? undefined : progressLabel)}
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

interface PageCurlPictureOptions {
  readonly base: SkPicture;
  readonly color: string;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly overlayInsets: Readonly<{ left: number; right: number }>;
  readonly pageScale: number;
  readonly progress: string;
  readonly progressFont?: SkFont;
  readonly title?: string;
  readonly titleFont?: SkFont;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
  readonly width: number;
}

function composePageCurlPicture(options: PageCurlPictureOptions): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, options.width, options.height));
  canvas.drawPicture(options.base);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(options.color));

  const chapterX = (options.overlayInsets.left + 18 - options.offsetX) / options.pageScale;
  const chapterY = (16 - options.offsetY) / options.pageScale;
  const chapterClipWidth = Math.max(
    0,
    (options.viewportWidth - options.overlayInsets.right - 18 - options.offsetX) / options.pageScale - chapterX,
  );
  if (options.title && options.titleFont && chapterClipWidth > 0) {
    canvas.save();
    canvas.clipRect(
      Skia.XYWHRect(chapterX, -options.offsetY / options.pageScale, chapterClipWidth, 24 / options.pageScale),
      ClipOp.Intersect,
      true,
    );
    canvas.drawText(options.title, chapterX, chapterY, paint, options.titleFont);
    canvas.restore();
  }

  if (options.progress && options.progressFont && options.width > 0 && options.height > 0) {
    const progressWidth = options.progressFont.getTextWidth(options.progress);
    const progressX = Math.max(
      chapterX,
      (options.viewportWidth - options.overlayInsets.right - 18 - progressWidth * options.pageScale - options.offsetX) / options.pageScale,
    );
    const progressY = (Math.max(12, options.viewportHeight - 12) - options.offsetY) / options.pageScale;
    canvas.drawText(options.progress, progressX, progressY, paint, options.progressFont);
  }
  paint.dispose();
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  return picture;
}
