import { useLocalSearchParams, useRouter } from 'expo-router';
import { Spinner } from 'heroui-native/spinner';
import { useCallback, useMemo, useRef, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { IconTabBar } from '@/components/ui/icon-tab-bar';
import type { ReaderViewport } from '@/reader';
import {
  anchoredGestureFingerX,
  bookXForGestureTravel,
  gestureLiftRotationForFingerX,
  gesturePressedChordForFingerX,
  pageGestureModeForStart,
  pageTurnStartBookXForTouch,
  postHingeTurnProgressForFingerX,
  ReaderSurface,
  shouldCommitTurn,
  type ReaderInteractiveTurn,
  type ReaderPageContent,
  visualTurnProgressForFingerX,
  weakGripPressedEdgeX,
} from '@/reader/native';
import { useReaderStore } from '@/stores';
import { ProgressDrawer } from '../components/bottom-tabs/progress-drawer';
import { TocDrawer } from '../components/bottom-tabs/toc-drawer';
import { TypographyDrawer } from '../components/bottom-tabs/typography-drawer';
import { ReaderControls } from '../components/reader-controls';
import { useReaderSession } from '../hooks/use-reader-session';

// ReaderControls overlays the surface, so only the safe-area edge gets reserved here.
const ReaderSurfaceTopSpacing = 4;
const ReaderSurfaceBottomSpacing = 4;
const ReaderChapterTopSpacing = 4;
interface ReaderDragState {
  readonly startSpread: number;
  readonly startX: number;
  direction: 1 | -1;
  targetSpread: number;
  startBookX: number;
  mode: 'full' | 'weak';
  latestProgress: number;
  renderProgress: number;
  grabX: number;
  grabY: number;
  fingerX: number;
  pressedEdgeX: number;
  heldRollTilt: number;
  throwVelocity: number;
  throwAcceleration: number;
  preparing: boolean;
  prepared: boolean;
}

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const [viewport, setViewport] = useState<ReaderViewport>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [isTypographyOpen, setIsTypographyOpen] = useState(false);
  const readerTheme = theme === 'dark' ? 'dark' : 'light';
  const animationStyle = useReaderStore((state) => state.animationStyle);
  const session = useReaderSession({
    bookId: bookId ?? '',
    viewport,
    theme: readerTheme,
  });
  const dragState = useRef<ReaderDragState | undefined>(undefined);
  const [interactiveTurn, setInteractiveTurn] = useState<ReaderInteractiveTurn>();
  const isReady = session.snapshot.phase === 'ready';
  const chapterTitle = session.snapshot.chapterTitle
    ?? session.metadata?.title
    ?? session.book?.title
    ?? '正在读取章节';
  const totalSpreads = session.snapshot.totalSpreads;
  const currentSpread = session.snapshot.bookSpreadIndex ?? session.snapshot.spreadIndex;
  const progressText = totalSpreads === undefined
    ? '页码计算中'
    : `${currentSpread + 1} / ${totalSpreads}`;
  const progressPercentage = totalSpreads === undefined
    ? undefined
    : Math.round((currentSpread / Math.max(totalSpreads - 1, 1)) * 100);

  const beginDrag = useCallback((startX: number, startY: number) => {
    if (!isReady || !viewport) return;
    dragState.current = {
      startSpread: session.snapshot.spreadIndex,
      startX,
      direction: 1,
      targetSpread: session.snapshot.spreadIndex + 1,
      startBookX: 1,
      mode: 'full',
      latestProgress: 0,
      renderProgress: 0,
      grabX: viewport.width / 2,
      grabY: startY,
      fingerX: 1,
      pressedEdgeX: 1,
      heldRollTilt: 0,
      throwVelocity: 0,
      throwAcceleration: 0,
      preparing: false,
      prepared: false,
    };
  }, [isReady, session.snapshot.spreadIndex, viewport]);

  const updateDrag = useCallback((translationX: number, absoluteX: number, absoluteY: number, velocityX: number) => {
    const state = dragState.current;
    if (!state || !viewport || !isReady) return;
    const direction: 1 | -1 = translationX < 0 ? 1 : -1;
    const targetSpread = state.startSpread + direction;
    state.startBookX = pageTurnStartBookXForTouch(state.startX, direction, viewport.width);
    state.mode = pageGestureModeForStart(state.startBookX);
    const currentBookX = bookXForGestureTravel(state.startBookX, translationX, direction, viewport.width);
    state.fingerX = anchoredGestureFingerX(state.startBookX, currentBookX);
    state.heldRollTilt = gestureLiftRotationForFingerX(state.fingerX);
    state.pressedEdgeX = state.mode === 'weak'
      ? weakGripPressedEdgeX(state.startBookX, currentBookX)
      : gesturePressedChordForFingerX(state.fingerX, state.heldRollTilt);
    state.latestProgress = postHingeTurnProgressForFingerX(state.fingerX, state.startBookX);
    state.renderProgress = state.mode === 'full'
      ? Math.max(state.latestProgress, visualTurnProgressForFingerX(state.fingerX))
      : 0;
    const instantaneousThrowVelocity = Math.max(
      0,
      (direction === 1 ? -velocityX : velocityX) / Math.max(1, viewport.width),
    );
    state.throwAcceleration = Math.max(
      0,
      (instantaneousThrowVelocity - state.throwVelocity) * 60,
    );
    state.throwVelocity += (instantaneousThrowVelocity - state.throwVelocity) * 0.35;
    state.grabX = Math.min(viewport.width, Math.max(0, absoluteX));
    state.grabY = Math.min(viewport.height, Math.max(0, absoluteY - insets.top - ReaderSurfaceTopSpacing));
    if (state.direction !== direction || state.targetSpread !== targetSpread) {
      state.direction = direction;
      state.targetSpread = targetSpread;
      state.preparing = false;
      state.prepared = false;
      setInteractiveTurn(undefined);
    }
    if (targetSpread < 0 || (totalSpreads !== undefined && targetSpread >= totalSpreads)) return;
    if (!state.preparing && !state.prepared) {
      state.preparing = true;
      void session.runtime.prepareSpread(targetSpread).then((prepared) => {
        const current = dragState.current;
        if (!prepared || !current || current.targetSpread !== targetSpread || current.direction !== direction) return;
        const targetPicture = session.runtime.getCurrentPicture(session.snapshot.revisionId, targetSpread);
        const targetFrame = session.runtime.getCurrentFrame(targetSpread);
        if (!targetPicture || !targetFrame) return;
        current.prepared = true;
        setInteractiveTurn({
          content: {
            key: `${session.snapshot.revisionId}:${targetSpread}:drag`,
            snapshot: { ...session.snapshot, spreadIndex: targetSpread, renderId: undefined },
            picture: targetPicture,
            frame: targetFrame,
          } satisfies ReaderPageContent,
          progress: current.latestProgress,
          grabX: current.grabX,
          grabY: current.grabY,
          gestureMode: current.mode,
          pressedEdgeX: current.pressedEdgeX,
          heldRollTilt: current.heldRollTilt,
          fingerX: current.fingerX,
          throwVelocity: current.throwVelocity,
          throwAcceleration: current.throwAcceleration,
        });
      });
    }
    if (state.prepared) {
      setInteractiveTurn((turn) => turn ? {
        ...turn,
        progress: state.renderProgress,
        grabX: state.grabX,
        grabY: state.grabY,
        gestureMode: state.mode,
        pressedEdgeX: state.pressedEdgeX,
        heldRollTilt: state.heldRollTilt,
        fingerX: state.fingerX,
        throwVelocity: state.throwVelocity,
        throwAcceleration: state.throwAcceleration,
      } : turn);
    }
  }, [insets.top, isReady, session.runtime, session.snapshot, totalSpreads, viewport]);

  const endDrag = useCallback((releaseVelocity = 0) => {
    const state = dragState.current;
    dragState.current = undefined;
    if (
      !state
      || !state.prepared
      || state.mode === 'weak'
    ) {
      setInteractiveTurn(undefined);
      return;
    }
    const terminalThrowVelocity = viewport
      ? Math.max(0, (state.direction === 1 ? -releaseVelocity : releaseVelocity) / Math.max(1, viewport.width))
      : 0;
    const throwVelocity = Math.max(state.throwVelocity, terminalThrowVelocity);
    if (!shouldCommitTurn(state.fingerX, throwVelocity, state.throwAcceleration)) {
      setInteractiveTurn(undefined);
      return;
    }
    const normalizedVelocity = viewport
      ? Math.abs(releaseVelocity) / Math.max(1, viewport.width)
      : 0;
    setInteractiveTurn((turn) => turn ? {
      ...turn,
      releaseVelocity: normalizedVelocity,
      throwVelocity,
      settling: true,
      settleTo: 1,
    } : turn);
    const navigate = state.direction > 0 ? session.runtime.next() : session.runtime.previous();
    const pageTurnStyle = animationStyle === 'page'
      || animationStyle === 'pageCurl'
      || animationStyle === 'simulation';
    const baseDuration = pageTurnStyle ? 1320 : 360;
    const releaseBoost = Math.min(pageTurnStyle ? 0.25 : 0.55, normalizedVelocity * 0.08);
    const settleDuration = Math.max(140, Math.round(baseDuration * (1 - releaseBoost)));
    void Promise.allSettled([navigate, waitForPageTurn(settleDuration)])
      .then(() => setInteractiveTurn(undefined));
  }, [animationStyle, session.runtime, viewport]);

  // Gesture callbacks execute after render; the ref keeps the in-flight drag
  // identity stable while React receives the prepared target asynchronously.
  /* eslint-disable react-hooks/refs */
  const panGesture = useMemo(
    () => Gesture.Pan()
      .minDistance(2)
      .onBegin((event) => beginDrag(event.x, event.y))
      .onUpdate((event) => updateDrag(event.translationX, event.absoluteX, event.absoluteY, event.velocityX))
      .onEnd((event) => endDrag(event.velocityX))
      .onFinalize(() => {
        if (dragState.current) endDrag();
      })
      .runOnJS(true),
    [beginDrag, endDrag, updateDrag],
  );
  /* eslint-enable react-hooks/refs */
  const canvasBackground = isReady
    ? session.runtime.getBackgroundColor()
    : readerTheme === 'dark'
      ? '#151515'
      : '#FAF9F6';

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) => {
      const next = {
        width: Math.round(width),
        height: Math.round(height),
        pixelRatio: PixelRatio.get(),
      };
      return current?.width === next.width && current.height === next.height
        ? current
        : next;
    });
  }, []);

  const handleReadingPress = useCallback(
    (x: number) => {
      if (!viewport || !isReady) {
        return;
      }
      if (x < viewport.width * 0.3) {
        void session.runtime.previous();
      } else if (x > viewport.width * 0.7) {
        void session.runtime.next();
      } else {
        setControlsVisible((value) => !value);
      }
    },
    [isReady, session.runtime, viewport],
  );

  const handleTabSelect = useCallback((key: string) => {
    if (key === 'toc') {
      setIsProgressOpen(false);
      setIsTypographyOpen(false);
      setIsTocOpen(true);
      return;
    }
    if (key === 'progress') {
      setIsTocOpen(false);
      setIsTypographyOpen(false);
      setIsProgressOpen(true);
      return;
    }
    if (key === 'typography') {
      setIsTocOpen(false);
      setIsProgressOpen(false);
      setIsTypographyOpen(true);
    }
  }, []);

  const statusText = useMemo(() => {
    switch (session.snapshot.phase) {
      case 'opening':
        return '正在读取 EPUB';
      case 'paginating':
        return '正在使用 Rito 分页';
      case 'reflowing':
        return '正在更新版面';
      default:
        return '正在准备阅读页面';
    }
  }, [session.snapshot.phase]);

  const surfaceTopInset = insets.top + ReaderSurfaceTopSpacing;
  const surfaceBottomInset = insets.bottom + ReaderSurfaceBottomSpacing;

  return (
    <View style={[styles.screen, { backgroundColor: canvasBackground }]}>
      <View
        onLayout={handleLayout}
        style={[styles.surfaceRegion, { top: surfaceTopInset, bottom: surfaceBottomInset }]}>
        <ReaderSurface
          runtime={session.runtime}
          snapshot={session.snapshot}
          animationStyle={animationStyle}
          interactiveTurn={interactiveTurn}
          style={StyleSheet.absoluteFill}
        />
        <GestureDetector gesture={panGesture}>
          <View collapsable={false} style={StyleSheet.absoluteFill}>
            <Pressable
              accessibilityLabel="阅读页面"
              accessibilityRole="adjustable"
              accessibilityValue={{
                min: 1,
                max: totalSpreads ?? Math.max(1, currentSpread + 1),
                now: currentSpread + 1,
                text: progressText,
              }}
              onPress={(event) => handleReadingPress(event.nativeEvent.locationX)}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </GestureDetector>
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.chapterOverlay,
          { paddingTop: insets.top + ReaderChapterTopSpacing, paddingLeft: insets.left + 18, paddingRight: insets.right + 18 },
        ]}>
        <Text className="text-sm text-muted" numberOfLines={1}>{chapterTitle}</Text>
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.progressOverlay,
          { paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 18, paddingRight: insets.right + 18 },
        ]}>
        <Text className="text-xs tabular-nums text-muted">
          {progressText}{progressPercentage === undefined ? '' : ` · ${progressPercentage}%`}
        </Text>
      </View>
      {(controlsVisible || Boolean(session.errorMessage)) && (
        <ReaderControls
          onBack={() => router.back()}
          title={chapterTitle}
        />
      )}

      {(controlsVisible || isTocOpen || isProgressOpen || isTypographyOpen) && (
        <IconTabBar
          activeKey={isTocOpen ? 'toc' : isProgressOpen ? 'progress' : isTypographyOpen ? 'typography' : undefined}
          items={[
            { key: 'toc', accessibilityLabel: '打开目录', name: { ios: 'list.bullet', android: 'format_list_bulleted', web: 'list' } },
            { key: 'progress', accessibilityLabel: '打开阅读进度', name: { ios: 'chart.bar', android: 'timeline', web: 'timeline' } },
            { key: 'typography', accessibilityLabel: '打开阅读设置', name: { ios: 'textformat.size', android: 'format_size', web: 'format_size' } },
          ]}
          onSelect={handleTabSelect}
        />
      )}

      {!isReady && !session.errorMessage && (
        <View className="absolute inset-0 items-center justify-center gap-4 bg-background">
          <Spinner color="default" size="lg" />
          <Text className="text-sm text-muted">{statusText}</Text>
        </View>
      )}

      {session.errorMessage && (
        <View className="absolute inset-0 items-center justify-center gap-3 bg-background px-8">
          <Text className="text-center text-xl font-semibold text-foreground">阅读器加载失败</Text>
          <Text className="text-center text-sm leading-6 text-muted">
            {session.errorMessage}
          </Text>
        </View>
      )}

      <TocDrawer
        isOpen={isTocOpen}
        onOpenChange={setIsTocOpen}
        runtime={session.runtime}
        toc={session.toc}
      />
      <ProgressDrawer
        isOpen={isProgressOpen}
        onOpenChange={setIsProgressOpen}
        runtime={session.runtime}
        snapshot={session.snapshot}
      />
      <TypographyDrawer
        isOpen={isTypographyOpen}
        onOpenChange={setIsTypographyOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  surfaceRegion: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  chapterOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  progressOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
  },
});

function waitForPageTurn(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
