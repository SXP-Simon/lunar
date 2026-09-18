import {
  Canvas,
  ClipOp,
  Fill,
  Group,
  Picture,
  Rect as SkiaRect,
  Skia,
  Text as SkiaText,
  processTransform3d,
  type SkFont,
  type SkPicture,
  useCanvasSize,
} from '@shopify/react-native-skia';
import { PixelRatio, processColor, type StyleProp, type ViewStyle } from 'react-native';
import { memo, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { i18n } from '@/i18n';
import type { ReaderSnapshot, ReaderSpreadMode } from '../../contracts';
import type { LunarReaderRuntime } from '../../runtime/core/native-reader-runtime';
import { readerDiagnostic, readerPerformanceMark } from '../../runtime/core/performance';
import {
  PageCurlMesh,
  automaticPageTurnPaintOrder,
  getReaderPageTurnEffect,
  nativeAutomaticPageTurnBaseContent,
  nativeInteractivePageTurnBaseContent,
  useNativePageTurns,
  useReaderPageTransition,
  usePageCurlTexture,
  type ReaderAutomaticTurn,
  type ReaderPageAnimationStyle,
  type ReaderPageContent,
  type ReaderPageTurnEffect,
  type ReaderInteractiveTurn,
  type ReaderPageTurnSurfaceBinding,
} from '../anime';
import {
  decorateReaderPageOverlays,
  mergeReaderOverlayRects,
  renderSkiaOverlays,
  type ReaderOverlayRect,
  type ReaderPageOverlayResolver,
} from './reader-overlays';
import { ReaderBookmarkMark, ReaderBookmarkPullMark, renderReaderBookmarkMark } from './reader-bookmark-mark';
import { readerBookmarkPlacement, ReaderBookmarkWidth } from './reader-bookmark-geometry';
import { createReaderSurfaceTransform, type ReaderSurfaceTransform } from './surface-transform';

export type { ReaderSurfaceTransform } from './surface-transform';
export { PAGE_TURN_DURATION_MS, READER_PAGE_ANIMATION_STYLES } from '../anime';
export type {
  ReaderAutomaticTurn,
  ReaderInteractiveTurn,
  ReaderPageAnimationStyle,
  ReaderPageContent,
} from '../anime';

export interface ReaderSurfaceProps {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly style?: StyleProp<ViewStyle>;
  /** Canvas color used before the runtime has produced its first page. */
  readonly initialBackgroundColor?: string;
  readonly overlays?: readonly ReaderOverlayRect[];
  readonly resolvePageOverlays?: ReaderPageOverlayResolver;
  readonly resolvePageBookmark?: (snapshot: ReaderSnapshot, frame: ReaderPageContent['frame']) => boolean;
  readonly bookmarkColor?: string;
  readonly bookmarkPullDistance?: SharedValue<number>;
  readonly bookmarkPullBookmarked?: SharedValue<boolean>;
  readonly bookmarkPullThreshold?: number;
  readonly bookmarkPullLabels?: Readonly<{
    addPulling: string;
    addReady: string;
    removePulling: string;
    removeReady: string;
  }>;
  readonly bookmarkOutlineColor?: string;
  readonly bookmarkHintColor?: string;
  readonly bookmarkReadyColor?: string;
  readonly pullBackgroundColor?: string;
  readonly allowNativePageTurns?: boolean;
  readonly onTransformChange?: (transform: ReaderSurfaceTransform) => void;
  /** Defaults to `slide`, which keeps the page content legible throughout the turn. */
  readonly animationStyle?: ReaderPageAnimationStyle;
  /** Duration in milliseconds for a page turn. */
  readonly animationDuration?: number;
  readonly spreadMode?: ReaderSpreadMode;
  /** Optional finger-controlled turn; its target picture can arrive during the drag. */
  readonly interactiveTurn?: ReaderInteractiveTurn;
  /** Automatic page turns retained until their visual transition completes. */
  readonly automaticTurns?: readonly ReaderAutomaticTurn[];
  readonly automaticNavigationActive?: boolean;
  readonly onAutomaticTurnComplete?: (turnId: number) => void;
  readonly pageTurnSurfaceBinding?: ReaderPageTurnSurfaceBinding;
  /** Skia-owned reader chrome rendered in the same Canvas as the page. */
  readonly chapterTitle?: string;
  readonly progressLabel?: string;
  readonly overlayColor?: string;
  readonly overlayInsets?: Readonly<{ top: number; right: number; bottom: number; left: number }>;
}

const EmptyOverlays: readonly ReaderOverlayRect[] = [];
const EmptyAutomaticTurns: readonly ReaderAutomaticTurn[] = [];
const DefaultOverlayInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const ReaderSurface = memo(function ReaderSurface({
  runtime,
  snapshot,
  style,
  initialBackgroundColor = '#000000',
  overlays = EmptyOverlays,
  resolvePageOverlays,
  resolvePageBookmark,
  bookmarkColor = '#E5594B',
  bookmarkPullDistance,
  bookmarkPullBookmarked,
  bookmarkPullThreshold = 96,
  bookmarkPullLabels,
  bookmarkOutlineColor = '#FFFFFF',
  bookmarkHintColor = '#A3A3A3',
  bookmarkReadyColor = '#FFFFFF',
  pullBackgroundColor,
  allowNativePageTurns = true,
  onTransformChange,
  animationStyle = 'slide',
  animationDuration = 360,
  spreadMode = 'double',
  interactiveTurn: preparedInteractiveTurn,
  automaticTurns: preparedAutomaticTurns = EmptyAutomaticTurns,
  automaticNavigationActive = false,
  onAutomaticTurnComplete,
  pageTurnSurfaceBinding,
  chapterTitle,
  progressLabel,
  overlayColor = '#777777',
  overlayInsets = DefaultOverlayInsets,
}: ReaderSurfaceProps) {
  const restingPull = useSharedValue(0);
  const restingBookmark = useSharedValue(false);
  const pull = bookmarkPullDistance ?? restingPull;
  const pullBookmarked = bookmarkPullBookmarked ?? restingBookmark;
  const pullMatrix = useDerivedValue(() => processTransform3d([
    { translateY: pull.value },
  ]), [pull]);
  const bookmarkPageOpacity = useDerivedValue(() =>
    pull.value > 0 ? 0 : 1,
  [pull]);
  const decoratePage = useCallback((content: ReaderPageContent): ReaderPageContent => ({
    ...decorateReaderPageOverlays(content, resolvePageOverlays),
    bookmarked: resolvePageBookmark?.(content.snapshot, content.frame) ?? false,
  }), [resolvePageBookmark, resolvePageOverlays]);
  const interactiveTurn = useMemo(() => preparedInteractiveTurn ? {
    ...preparedInteractiveTurn,
    content: preparedInteractiveTurn.content
      ? decoratePage(preparedInteractiveTurn.content)
      : undefined,
  } : undefined, [decoratePage, preparedInteractiveTurn]);
  const automaticTurns = useMemo(() => preparedAutomaticTurns.map((turn) => ({
    ...turn,
    from: decoratePage(turn.from),
    to: decoratePage(turn.to),
  })), [decoratePage, preparedAutomaticTurns]);
  const pageTurnEffect = getReaderPageTurnEffect(animationStyle);
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
  const overlayTop = overlayInsets.top;
  const overlayBottom = overlayInsets.bottom;
  const offsetX = frame ? (viewport.width - frame.width * scale) / 2 : 0;
  const offsetY = frame ? (viewport.height - frame.height * scale) / 2 : 0;
  const currentKey = snapshot.phase === 'ready' && compiled && frame
    ? `${snapshot.revisionId}:${snapshot.spreadIndex}:${snapshot.renderId ?? 0}`
    : undefined;
  const currentOverlays = useMemo(
    () => mergeReaderOverlayRects([
      ...(frame ? resolvePageOverlays?.(snapshot, frame) ?? [] : []),
      ...overlays,
    ].filter((overlay) =>
      overlay.revisionId === undefined || overlay.revisionId === snapshot.revisionId)),
    [frame, overlays, resolvePageOverlays, snapshot],
  );
  const currentContent = useMemo<ReaderPageContent | undefined>(
    () => currentKey && compiled && frame
      ? { key: currentKey, snapshot, picture: compiled, frame, overlays: currentOverlays,
        bookmarked: resolvePageBookmark?.(snapshot, frame) ?? false }
      : undefined,
    [compiled, currentKey, currentOverlays, frame, resolvePageBookmark, snapshot],
  );
  const pullPlacement = currentContent
    ? readerBookmarkPlacement(currentContent.frame, scale, offsetX, offsetY, overlayTop)
    : undefined;
  const bookmarkHintFont = bookmarkPullLabels ? runtime.getUiFont(16) : undefined;
  const paperColor = snapshot.phase === 'ready'
    ? runtime.getBackgroundColor()
    : initialBackgroundColor;
  const processedPaperColor = processColor(paperColor);
  const nativePaperColor = typeof processedPaperColor === 'number'
    ? processedPaperColor >>> 0
    : 0xffffffff;
  const nativeTextureScale = Math.min(3, Math.max(1, PixelRatio.get()));
  const nativePixelWidth = Math.max(1, Math.round(viewport.width * nativeTextureScale));
  const nativePixelHeight = Math.max(1, Math.round(viewport.height * nativeTextureScale));
  const createNativePagePicture = useCallback((content: ReaderPageContent) => {
    const pageScale = Math.max(0.001, scale);
    const title = content.snapshot.chapterTitle ?? chapterTitle;
    const pagePicture = composePageCurlPicture({
      base: content.picture.picture,
      frame: content.frame,
      color: overlayColor,
      height: content.frame.height,
      offsetX,
      offsetY,
      overlayInsets: {
        top: overlayTop,
        right: overlayRight,
        bottom: overlayBottom,
        left: overlayLeft,
      },
      overlays: content.overlays,
      bookmarked: content.bookmarked,
      bookmarkColor,
      pageScale,
      progress: progressLabelForSnapshot(content.snapshot),
      progressFont: runtime.getUiFont(12 / pageScale),
      title,
      titleFont: title ? runtime.getUiFont(14 / pageScale) : undefined,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
      width: content.frame.width,
    });
    try {
      return recordNativeViewportPicture({
        pagePicture,
        paperColor,
        pageScale,
        offsetX,
        offsetY,
        pixelHeight: nativePixelHeight,
        pixelWidth: nativePixelWidth,
        textureScale: nativeTextureScale,
      });
    } finally {
      pagePicture.dispose();
    }
  }, [
    nativePixelHeight,
    nativePixelWidth,
    nativeTextureScale,
    bookmarkColor,
    chapterTitle,
    offsetX,
    offsetY,
    overlayBottom,
    overlayColor,
    overlayLeft,
    overlayRight,
    overlayTop,
    paperColor,
    runtime,
    scale,
    viewport.height,
    viewport.width,
  ]);
  const nativeAutomaticPageTurnState = useNativePageTurns({
    canvasRef: ref,
    enabled: allowNativePageTurns && pageTurnEffect.native !== undefined
      && spreadMode === 'single'
      && (
        onAutomaticTurnComplete !== undefined
        || pageTurnSurfaceBinding !== undefined
      ),
    turns: automaticTurns,
    pixelWidth: nativePixelWidth,
    pixelHeight: nativePixelHeight,
    paperColor: nativePaperColor,
    createPicture: createNativePagePicture,
    onComplete: onAutomaticTurnComplete,
    pageTurnEffect,
    fixedChromeTop: overlayTop + 24,
    fixedChromeBottom: overlayBottom + 24,
    currentContent,
    interactiveTurn,
    interactiveSource: currentContent,
    surfaceBinding: pageTurnSurfaceBinding,
  });
  const {
    transition: activeTransition,
    visibleContent,
    visualKind: pageTurnVisualKind,
    coverMatrix,
    incomingSlideMatrix,
    outgoingSlideMatrix,
    progress,
    grabX,
    grabY,
  } = useReaderPageTransition(
    currentContent,
    pageTurnEffect,
    animationDuration,
    interactiveTurn,
    spreadMode,
    automaticTurns[0],
    automaticTurns.length,
    automaticNavigationActive,
    onAutomaticTurnComplete,
    nativeAutomaticPageTurnState.enabled,
  );
  const incomingContent = interactiveTurn && !interactiveTurn.content
    ? undefined
    : visibleContent ?? currentContent;
  const incomingPicture = incomingContent?.picture.picture;
  const incomingSnapshot = incomingContent?.snapshot ?? snapshot;
  const incomingFrame = incomingContent?.frame ?? frame;
  const incomingKey = incomingContent?.key ?? currentKey;
  const automaticDirection = automaticTurns[0]?.direction ?? 1;
  const automaticPaintTurns = useMemo(
    () => automaticPageTurnPaintOrder(automaticTurns, automaticDirection).map((turn) => ({
      ...turn,
      from: activeTransition?.from.key === turn.from.key ? activeTransition.from : turn.from,
    })),
    [activeTransition, automaticDirection, automaticTurns],
  );
  const automaticBackgroundContent = automaticPaintTurns.length === 0
    ? undefined
    : automaticDirection > 0
      ? automaticPaintTurns.at(-1)?.to
      : automaticPaintTurns[0]?.from;
  const automaticPageTurnsVisible = pageTurnVisualKind === 'curl'
    && automaticTurns.length > 0;
  const nativeAutomaticPageTurnsVisible = automaticTurns.length > 0
    && nativeAutomaticPageTurnState.enabled;
  const fallbackAutomaticPageTurnsVisible = automaticPageTurnsVisible
    && !nativeAutomaticPageTurnState.enabled;
  const transitionActive = activeTransition !== undefined;
  const nativeInteractiveGestureDriven = interactiveTurn?.nativeGesture?.driven === true;
  const nativeInteractiveBaseContent = nativeInteractivePageTurnBaseContent(
    activeTransition?.from,
    interactiveTurn?.content,
    interactiveTurn?.nativeGesture,
  );
  const nativeAutomaticBaseContent = nativeAutomaticPageTurnBaseContent(
    automaticTurns,
    currentContent,
    nativeAutomaticPageTurnState.presentedTurnId,
  );

  useEffect(() => {
    readerDiagnostic(
      'turn.surface.state',
      [
        `snapshot=${snapshot.revisionId}:${snapshot.spreadIndex}:${snapshot.renderId ?? 'none'}`,
        `current=${currentKey ?? 'none'}`,
        `incoming=${incomingKey ?? 'none'}`,
        `from=${activeTransition?.from.key ?? 'none'}`,
        `to=${activeTransition?.toKey ?? 'none'}`,
        `slideForeground=${pageTurnVisualKind === 'slide' ? (activeTransition?.from.key ?? currentKey ?? 'none') : 'none'}`,
        `mode=${transitionActive ? pageTurnVisualKind : 'static'}`,
        `interactive=${String(Boolean(interactiveTurn))}`,
        `automatic=${automaticTurns.length}`,
        `automaticTurn=${automaticTurns[0]?.id ?? 'none'}`,
        `settling=${String(interactiveTurn?.settling === true)}`,
        `picture=${String(Boolean(incomingPicture))}`,
        `frame=${String(Boolean(incomingFrame))}`,
      ].join(' '),
    );
  }, [
    activeTransition?.from.key,
    activeTransition?.toKey,
    automaticTurns,
    currentKey,
    incomingFrame,
    incomingKey,
    incomingPicture,
    interactiveTurn,
    pageTurnVisualKind,
    snapshot.renderId,
    snapshot.revisionId,
    snapshot.spreadIndex,
    transitionActive,
  ]);

  // The moving sheet owns its chrome. Recording it into the same source
  // picture prevents a footer or chapter title from travelling on a separate
  // linear transform while the paper follows the curl profile.
  const isSinglePreviousPageTurn = pageTurnVisualKind === 'curl'
    && spreadMode === 'single'
    && activeTransition?.direction === -1;
  const pageCurlSource = pageTurnVisualKind === 'curl'
    && !automaticNavigationActive
    && !nativeInteractiveGestureDriven
    ? activeTransition
      ? isSinglePreviousPageTurn
        ? incomingContent
        : activeTransition.from
      : incomingContent
    : undefined;
  const pageCurlWidth = pageCurlSource?.frame.width ?? activeTransition?.from.frame.width ?? 0;
  const pageCurlHeight = pageCurlSource?.frame.height ?? activeTransition?.from.frame.height ?? 0;
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
      frame: source.frame,
      color: overlayColor,
      height: source.frame.height,
      offsetX,
      offsetY,
      pageScale,
      progress: pageCurlProgressText,
      bookmarked: source.bookmarked,
      bookmarkColor,
      progressFont,
      title,
      titleFont,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
      width: source.frame.width,
      overlayInsets: {
        top: overlayTop,
        right: overlayRight,
        bottom: overlayBottom,
        left: overlayLeft,
      },
      overlays: source.overlays,
    });
  }, [
    offsetX,
    offsetY,
    overlayColor,
    overlayBottom,
    overlayLeft,
    overlayRight,
    overlayTop,
    bookmarkColor,
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
    pageCurlSource?.key,
    pageCurlTexturePicture !== undefined,
  );

  useEffect(() => {
    onTransformChange?.(createReaderSurfaceTransform(scale, offsetX, offsetY));
  }, [offsetX, offsetY, onTransformChange, scale]);

  const canRenderFrame = snapshot.phase === 'ready'
    && (
      (compiled !== undefined && frame !== undefined)
      || activeTransition !== undefined
      || automaticPageTurnsVisible
    );
  const renderChrome = (
    chromeSnapshot: ReaderSnapshot,
    chromeFrame: { readonly width: number; readonly height: number },
    titleOverride?: string,
    progressOverride?: string,
  ): ReactNode => {
    const pageScale = Math.max(0.001, scale);
    const title = titleOverride ?? chromeSnapshot.chapterTitle ?? chapterTitle;
    const progress = progressOverride ?? progressLabelForSnapshot(chromeSnapshot);
    const titleFont = title ? runtime.getUiFont(14 / pageScale) : undefined;
    const progressFont = progress ? runtime.getUiFont(12 / pageScale) : undefined;
    const chapterX = (overlayInsets.left + 18 - offsetX) / pageScale;
    const chapterY = (overlayInsets.top + 16 - offsetY) / pageScale;
    const progressWidth = progressFont && progress ? progressFont.getTextWidth(progress) : 0;
    const progressX = Math.max(
      chapterX,
      (viewport.width - overlayInsets.right - 18 - progressWidth * pageScale - offsetX) / pageScale,
    );
    const progressY = (
      Math.max(overlayInsets.top + 12, viewport.height - overlayInsets.bottom - 12) - offsetY
    ) / pageScale;
    const chapterClipWidth = Math.max(
      0,
      (viewport.width - overlayInsets.right - 18 - offsetX) / pageScale - chapterX,
    );
    if ((!title || !titleFont) && (!progress || !progressFont)) return null;
    return (
      <>
        {title && titleFont && (
          <Group clip={{ x: chapterX, y: (overlayInsets.top - offsetY) / pageScale, width: chapterClipWidth, height: 24 / pageScale }}>
            <SkiaText color={overlayColor} font={titleFont} text={title} x={chapterX} y={chapterY} />
          </Group>
        )}
        {progress && progressFont && chromeFrame.width > 0 && chromeFrame.height > 0 && (
          <SkiaText color={overlayColor} font={progressFont} text={progress} x={progressX} y={progressY} />
        )}
      </>
    );
  };
  const renderPage = (content: ReaderPageContent): ReactNode => (
    <>
      <ReaderPagePicture content={content} />
      {content.bookmarked && (
        <Group opacity={bookmarkPageOpacity}>
          <ReaderBookmarkMark frame={content.frame} pageScale={scale} offsetX={offsetX}
            topInset={overlayTop} offsetY={offsetY} color={bookmarkColor} />
        </Group>
      )}
    </>
  );
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
      <Fill color={pullBackgroundColor ?? paperColor} />
      <Group matrix={pullMatrix}>
        <SkiaRect x={0} y={0} width={viewport.width} height={viewport.height} color={paperColor} />
        {canRenderFrame && (
          <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale }]}>
          {nativeAutomaticPageTurnsVisible && nativeAutomaticBaseContent ? (
            <Group>
              {renderPage(nativeAutomaticBaseContent)}
              {renderChrome(
                nativeAutomaticBaseContent.snapshot,
                nativeAutomaticBaseContent.frame,
              )}
            </Group>
          ) : fallbackAutomaticPageTurnsVisible && automaticBackgroundContent ? (
            <Group>
              {renderPage(automaticBackgroundContent)}
              {renderChrome(
                automaticBackgroundContent.snapshot,
                automaticBackgroundContent.frame,
              )}
              {automaticPaintTurns.map((turn) => (
                <AutomaticPageCurlLayer
                  key={turn.id}
                  animationDuration={animationDuration}
                  offsetX={offsetX}
                  offsetY={offsetY}
                  onComplete={onAutomaticTurnComplete}
                  overlayColor={overlayColor}
                  bookmarkColor={bookmarkColor}
                  overlayInsets={overlayInsets}
                  pageTurnEffect={pageTurnEffect}
                  runtime={runtime}
                  scale={scale}
                  spreadMode={spreadMode}
                  turn={turn}
                  viewportHeight={viewport.height}
                  viewportWidth={viewport.width}
                />
              ))}
            </Group>
          ) : pageTurnVisualKind === 'curl' ? (
            <Group key="page-content">
              <Group key="page-current">
                {nativeInteractiveBaseContent ? (
                  <>
                    {renderPage(nativeInteractiveBaseContent)}
                    {renderChrome(
                      nativeInteractiveBaseContent.snapshot,
                      nativeInteractiveBaseContent.frame,
                    )}
                  </>
                ) : (
                  <>
                    {incomingContent && renderPage(incomingContent)}
                    {incomingFrame && renderChrome(incomingSnapshot, incomingFrame, chapterTitle, interactiveTurn ? undefined : progressLabel)}
                  </>
                )}
              </Group>
              {activeTransition && !nativeInteractiveGestureDriven && isSinglePreviousPageTurn && (
                <Group key={`page-source:${activeTransition.from.key}`}>
                  {renderPage(activeTransition.from)}
                  {renderChrome(activeTransition.from.snapshot, activeTransition.from.frame)}
                </Group>
              )}
              {activeTransition && !nativeInteractiveGestureDriven && (
                <PageCurlMesh
                  key={pageCurlSource?.key ?? activeTransition.from.key}
                  direction={activeTransition.direction}
                  grabX={isSinglePreviousPageTurn ? pageCurlWidth * 0.6 : grabX}
                  grabY={isSinglePreviousPageTurn ? pageCurlHeight / 2 : grabY}
                  grabYValue={isSinglePreviousPageTurn ? undefined : interactiveTurn?.grabYValue}
                  heldRollTilt={isSinglePreviousPageTurn ? undefined : interactiveTurn?.heldRollTilt}
                  heldRollTiltValue={isSinglePreviousPageTurn ? undefined : interactiveTurn?.heldRollTiltValue}
                  height={pageCurlHeight}
                  initialProgress={interactiveTurn?.progress}
                  paperColor={paperColor}
                  phase={isSinglePreviousPageTurn ? 'incoming-landing' : 'full'}
                  spreadMode={spreadMode}
                  gestureDriven={Boolean(interactiveTurn)}
                  settling={interactiveTurn?.settling}
                  settleTo={interactiveTurn?.settleTo}
                  picture={pageCurlSource?.picture ?? activeTransition.from.picture}
                  pressedEdgeX={isSinglePreviousPageTurn ? undefined : interactiveTurn?.pressedEdgeX}
                  pressedEdgeXValue={isSinglePreviousPageTurn ? undefined : interactiveTurn?.pressedEdgeXValue}
                  progress={progress}
                  texture={pageCurlTexture}
                  width={pageCurlWidth}
                />
              )}
            </Group>
          ) : activeTransition && pageTurnVisualKind === 'cover' ? (
            <Group>
              <Group>
                {renderPage(activeTransition.from)}
                {renderChrome(activeTransition.from.snapshot, activeTransition.from.frame)}
              </Group>
              <Group matrix={coverMatrix}>
                {incomingContent && renderPage(incomingContent)}
                {incomingFrame && renderChrome(incomingSnapshot, incomingFrame, chapterTitle, interactiveTurn ? undefined : progressLabel)}
              </Group>
            </Group>
          ) : pageTurnVisualKind === 'slide' ? (
            <Group>
              {nativeInteractiveGestureDriven && nativeInteractiveBaseContent ? (
                <Group key={`slide-native-base:${nativeInteractiveBaseContent.key}`}>
                  {renderPage(nativeInteractiveBaseContent)}
                  {renderChrome(
                    nativeInteractiveBaseContent.snapshot,
                    nativeInteractiveBaseContent.frame,
                  )}
                </Group>
              ) : (
                <>
                  <Group
                    key="slide-current"
                    matrix={activeTransition ? incomingSlideMatrix : undefined}>
                    {incomingContent && renderPage(incomingContent)}
                  </Group>
                  {activeTransition && (
                    <Group
                      key={`slide-outgoing:${activeTransition.from.key}`}
                      matrix={outgoingSlideMatrix}>
                      {renderPage(activeTransition.from)}
                    </Group>
                  )}
                  {incomingFrame && renderChrome(
                    incomingSnapshot,
                    incomingFrame,
                    chapterTitle,
                    interactiveTurn ? undefined : progressLabel,
                  )}
                </>
              )}
            </Group>
          ) : (
            <>
              {incomingContent && renderPage(incomingContent)}
              {incomingFrame && renderChrome(incomingSnapshot, incomingFrame, chapterTitle, interactiveTurn ? undefined : progressLabel)}
            </>
          )}
          </Group>
        )}
      </Group>
      {pullPlacement && bookmarkPullLabels && (
        <ReaderBookmarkPullMark distance={pull} pullBookmarked={pullBookmarked}
          baselineHeight={pullPlacement.height} rightEdge={pullPlacement.x + ReaderBookmarkWidth}
          threshold={bookmarkPullThreshold} color={bookmarkColor}
          outlineColor={bookmarkOutlineColor} hintColor={bookmarkHintColor}
          readyColor={bookmarkReadyColor} font={bookmarkHintFont} labels={bookmarkPullLabels} />
      )}
    </Canvas>
  );
});

function ReaderPagePicture({ content }: { readonly content: ReaderPageContent }) {
  return (
    <>
      <Picture picture={content.picture.picture} />
      {mergeReaderOverlayRects(content.overlays ?? []).map((overlay, index) => (
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
    </>
  );
}

interface AutomaticPageCurlLayerProps {
  readonly animationDuration: number;
  readonly bookmarkColor: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly onComplete?: (turnId: number) => void;
  readonly overlayColor: string;
  readonly overlayInsets: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  readonly pageTurnEffect: ReaderPageTurnEffect;
  readonly runtime: LunarReaderRuntime;
  readonly scale: number;
  readonly spreadMode: ReaderSpreadMode;
  readonly turn: ReaderAutomaticTurn;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

const AutomaticPageCurlLayer = memo(function AutomaticPageCurlLayer({
  animationDuration,
  bookmarkColor,
  offsetX,
  offsetY,
  onComplete,
  overlayColor,
  overlayInsets,
  pageTurnEffect,
  runtime,
  scale,
  spreadMode,
  turn,
  viewportHeight,
  viewportWidth,
}: AutomaticPageCurlLayerProps) {
  const { direction, id: turnId } = turn;
  const incomingLanding = spreadMode === 'single' && direction < 0;
  const source = incomingLanding ? turn.to : turn.from;
  const progressText = progressLabelForSnapshot(source.snapshot);
  const texturePicture = useMemo(() => {
    const pageScale = Math.max(0.001, scale);
    const title = source.snapshot.chapterTitle;
    const titleFont = title ? runtime.getUiFont(14 / pageScale) : undefined;
    const progressFont = runtime.getUiFont(12 / pageScale);
    if ((!title || !titleFont) && !progressFont) return undefined;
    return composePageCurlPicture({
      base: source.picture.picture,
      frame: source.frame,
      bookmarked: source.bookmarked,
      bookmarkColor,
      color: overlayColor,
      height: source.frame.height,
      offsetX,
      offsetY,
      overlayInsets,
      overlays: source.overlays,
      pageScale,
      progress: progressText,
      progressFont,
      title,
      titleFont,
      viewportHeight,
      viewportWidth,
      width: source.frame.width,
    });
  }, [
    bookmarkColor,
    offsetX,
    offsetY,
    overlayColor,
    overlayInsets,
    progressText,
    runtime,
    scale,
    source,
    viewportHeight,
    viewportWidth,
  ]);
  const texture = usePageCurlTexture(
    texturePicture ?? source.picture.picture,
    source.frame.width,
    source.frame.height,
    `${source.key}:automatic:${turnId}`,
    texturePicture !== undefined,
  );
  const progress = useSharedValue(0);
  const texturesReady = texture.ready;

  useEffect(() => {
    if (!texturesReady) return;
    const duration = pageTurnEffect.motion.getDuration({
      releaseVelocity: 0,
      animationDuration,
      incomingPageLanding: incomingLanding,
    });
    progress.set(withTiming(1, {
      duration,
      easing: pageTurnEffect.motion.getEasing({
        fromProgress: 0,
        targetProgress: 1,
        releaseVelocityPxPerMs: 0,
        incomingPageLanding: incomingLanding,
        interactive: false,
      }),
    }, (finished) => {
      if (finished && onComplete) scheduleOnRN(onComplete, turnId);
    }));
    return () => cancelAnimation(progress);
  }, [
    animationDuration,
    incomingLanding,
    onComplete,
    pageTurnEffect,
    progress,
    texturesReady,
    turnId,
  ]);

  return (
    <PageCurlMesh
      direction={direction}
      grabX={incomingLanding ? source.frame.width * 0.6 : direction > 0 ? 0 : source.frame.width}
      grabY={source.frame.height / 2}
      height={source.frame.height}
      phase={incomingLanding ? 'incoming-landing' : 'full'}
      paperColor={runtime.getBackgroundColor()}
      picture={source.picture}
      progress={progress}
      spreadMode={spreadMode}
      texture={texture}
      width={source.frame.width}
    />
  );
});

function progressLabelForSnapshot(snapshot: ReaderSnapshot): string {
  const totalSpreads = snapshot.totalSpreads;
  const currentSpread = snapshot.bookSpreadIndex ?? snapshot.spreadIndex;
  const progressText = totalSpreads === undefined
    ? i18n.t('reader.calculatingPages')
    : `${currentSpread + 1} / ${totalSpreads}`;
  if (totalSpreads === undefined) return progressText;
  const progressPercentage = Math.round((currentSpread / Math.max(totalSpreads - 1, 1)) * 100);
  return `${progressText} · ${progressPercentage}%`;
}

interface PageCurlPictureOptions {
  readonly base: SkPicture;
  readonly frame: ReaderPageContent['frame'];
  readonly bookmarked?: boolean;
  readonly bookmarkColor: string;
  readonly color: string;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly overlayInsets: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  readonly overlays?: readonly ReaderOverlayRect[];
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
  renderSkiaOverlays(canvas, options.overlays ?? []);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(options.color));

  const chapterX = (options.overlayInsets.left + 18 - options.offsetX) / options.pageScale;
  const chapterY = (options.overlayInsets.top + 16 - options.offsetY) / options.pageScale;
  const chapterClipWidth = Math.max(
    0,
    (options.viewportWidth - options.overlayInsets.right - 18 - options.offsetX) / options.pageScale - chapterX,
  );
  if (options.title && options.titleFont && chapterClipWidth > 0) {
    canvas.save();
    canvas.clipRect(
      Skia.XYWHRect(
        chapterX,
        (options.overlayInsets.top - options.offsetY) / options.pageScale,
        chapterClipWidth,
        24 / options.pageScale,
      ),
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
    const progressY = (
      Math.max(
        options.overlayInsets.top + 12,
        options.viewportHeight - options.overlayInsets.bottom - 12,
      ) - options.offsetY
    ) / options.pageScale;
    canvas.drawText(options.progress, progressX, progressY, paint, options.progressFont);
  }
  if (options.bookmarked) {
    renderReaderBookmarkMark(canvas, options.frame, options.pageScale,
      options.offsetX, options.offsetY, options.overlayInsets.top, options.bookmarkColor);
  }
  paint.dispose();
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  return picture;
}

interface NativeViewportPictureOptions {
  readonly pagePicture: SkPicture;
  readonly paperColor: string;
  readonly pageScale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly textureScale: number;
}

function recordNativeViewportPicture(options: NativeViewportPictureOptions): SkPicture {
  const recorder = Skia.PictureRecorder();
  try {
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(0, 0, options.pixelWidth, options.pixelHeight),
    );
    canvas.clear(Skia.Color(options.paperColor));
    canvas.scale(options.textureScale, options.textureScale);
    canvas.translate(options.offsetX, options.offsetY);
    canvas.scale(options.pageScale, options.pageScale);
    canvas.drawPicture(options.pagePicture);
    return recorder.finishRecordingAsPicture();
  } finally {
    recorder.dispose();
  }
}
