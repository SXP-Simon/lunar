import { useLocalSearchParams, useRouter } from 'expo-router';
import { Spinner } from 'heroui-native/spinner';
import { useCallback, useMemo, useRef, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { IconTabBar } from '@/components/ui/icon-tab-bar';
import type { ReaderViewport } from '@/reader';
import {
  anchoredGestureFingerX,
  bookXForGestureTravel,
  gestureLiftRotationForFingerX,
  gesturePressedChordForFingerX,
  pageTurnStartBookXForTouch,
  PAGE_TURN_DURATION_MS,
  postHingeTurnProgressForFingerX,
  ReaderSurface,
  shouldCommitTurn,
  type ReaderInteractiveTurn,
  type ReaderPageContent,
  visualTurnProgressForFingerX,
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
interface ReaderDragState {
  readonly startSpread: number;
  readonly startX: number;
  direction: 1 | -1;
  directionLocked: boolean;
  targetSpread: number;
  startBookX: number;
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
  const handoffGeneration = useRef(0);
  const gestureProgress = useSharedValue(0);
  const gestureStarted = useSharedValue(false);
  const gestureDirectionLocked = useSharedValue(false);
  const gestureDirection = useSharedValue<1 | -1>(1);
  const gestureStartX = useSharedValue(0);
  const gestureStartBookX = useSharedValue(1);
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
    if (!isReady || !viewport || interactiveTurn?.settling) return;
    handoffGeneration.current += 1;
    dragState.current = {
      startSpread: session.snapshot.spreadIndex,
      startX,
      direction: 1,
      directionLocked: false,
      targetSpread: session.snapshot.spreadIndex + 1,
      startBookX: 1,
      latestProgress: 0,
      renderProgress: 0,
      // The curl anchor is the point where the sheet was first caught. The
      // moving finger affects progress, while changing this anchor every
      // frame would continuously change the page's curvature.
      grabX: Math.min(viewport.width, Math.max(0, startX)),
      grabY: startY,
      fingerX: 1,
      pressedEdgeX: 1,
      heldRollTilt: 0,
      throwVelocity: 0,
      throwAcceleration: 0,
      preparing: false,
      prepared: false,
    };
  }, [interactiveTurn?.settling, isReady, session.snapshot.spreadIndex, viewport]);

  const updateDrag = useCallback((translationX: number, absoluteY: number, velocityX: number) => {
    const state = dragState.current;
    if (!state || !viewport || !isReady) return;
    if (!state.directionLocked) {
      if (Math.abs(translationX) < 2) return;
      state.direction = translationX < 0 ? 1 : -1;
      state.directionLocked = true;
    }
    const direction = state.direction;
    const targetSpread = state.startSpread + direction;
    state.startBookX = pageTurnStartBookXForTouch(state.startX, direction, viewport.width);
    const currentBookX = bookXForGestureTravel(state.startBookX, translationX, direction, viewport.width);
    state.fingerX = anchoredGestureFingerX(state.startBookX, currentBookX);
    state.heldRollTilt = gestureLiftRotationForFingerX(state.fingerX);
    state.pressedEdgeX = gesturePressedChordForFingerX(state.fingerX, state.heldRollTilt);
    state.latestProgress = postHingeTurnProgressForFingerX(state.fingerX, state.startBookX);
    state.renderProgress = Math.max(state.latestProgress, visualTurnProgressForFingerX(state.fingerX));
    const instantaneousThrowVelocity = Math.max(
      0,
      (direction === 1 ? -velocityX : velocityX) / Math.max(1, viewport.width),
    );
    state.throwAcceleration = Math.max(
      0,
      (instantaneousThrowVelocity - state.throwVelocity) * 60,
    );
    state.throwVelocity += (instantaneousThrowVelocity - state.throwVelocity) * 0.35;
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
          // Keep the first prepared frame at the same visual position as the
          // finger. `latestProgress` only describes the post-hinge commit
          // stage and is intentionally near zero while the sheet is lifting.
          progress: current.renderProgress,
          progressValue: gestureProgress,
          grabX: current.grabX,
          grabY: current.grabY,
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
        pressedEdgeX: state.pressedEdgeX,
        heldRollTilt: state.heldRollTilt,
        fingerX: state.fingerX,
        throwVelocity: state.throwVelocity,
        throwAcceleration: state.throwAcceleration,
      } : turn);
    }
  }, [gestureProgress, insets.top, isReady, session.runtime, session.snapshot, totalSpreads, viewport]);

  const endDrag = useCallback((releaseVelocity = 0, releaseTranslationX = 0) => {
    if (interactiveTurn?.settling) return;
    const state = dragState.current;
    dragState.current = undefined;
    if (
      !state
      || !state.directionLocked
    ) {
      setInteractiveTurn(undefined);
      return;
    }
    // Android may deliver the last horizontal sample only through onEnd.
    // Apply that sample before scoring the release so the visible sheet and
    // the commit decision use the same terminal finger position.
    if (viewport && Number.isFinite(releaseTranslationX)) {
      const currentBookX = bookXForGestureTravel(
        state.startBookX,
        releaseTranslationX,
        state.direction,
        viewport.width,
      );
      state.fingerX = anchoredGestureFingerX(state.startBookX, currentBookX);
      state.heldRollTilt = gestureLiftRotationForFingerX(state.fingerX);
      state.pressedEdgeX = gesturePressedChordForFingerX(state.fingerX, state.heldRollTilt);
      state.latestProgress = postHingeTurnProgressForFingerX(state.fingerX, state.startBookX);
      state.renderProgress = Math.max(state.latestProgress, visualTurnProgressForFingerX(state.fingerX));
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
    if (!state.prepared) {
      // The target picture may still be compiling when a fast release arrives.
      // Let runtime navigation finish the preparation; its normal transition
      // will take over once the ready snapshot is published.
      setInteractiveTurn(undefined);
      void (state.direction > 0 ? session.runtime.next() : session.runtime.previous());
      return;
    }
    setInteractiveTurn((turn) => turn ? {
      ...turn,
      progress: state.renderProgress,
      progressValue: gestureProgress,
      pressedEdgeX: state.pressedEdgeX,
      heldRollTilt: state.heldRollTilt,
      fingerX: state.fingerX,
      releaseVelocity: normalizedVelocity,
      throwVelocity,
      settling: true,
      settleTo: 1,
    } : turn);
    const navigate = state.direction > 0 ? session.runtime.next() : session.runtime.previous();
    const pageTurnStyle = animationStyle === 'page'
      || animationStyle === 'pageCurl'
      || animationStyle === 'simulation';
    const baseDuration = pageTurnStyle ? PAGE_TURN_DURATION_MS : 360;
    const releaseBoost = pageTurnStyle ? 0 : Math.min(0.55, normalizedVelocity * 0.08);
    const settleDuration = Math.max(140, Math.round(baseDuration * (1 - releaseBoost)));
    const generation = ++handoffGeneration.current;
    void Promise.allSettled([
      navigate,
      waitForPageTurn(settleDuration),
    ])
      .then(() => {
        if (handoffGeneration.current !== generation) return;
        if (session.runtime.getSnapshot().spreadIndex !== state.targetSpread) {
          setInteractiveTurn(undefined);
          return;
        }
        void waitForPageHandoffFrames().then(() => {
          if (handoffGeneration.current === generation) setInteractiveTurn(undefined);
        });
      });
  }, [animationStyle, gestureProgress, interactiveTurn?.settling, session.runtime, viewport]);

  // Horizontal progress is calculated on the UI runtime. JS callbacks only
  // prepare the adjacent picture and commit the navigation result.
  /* eslint-disable react-hooks/refs, react-hooks/immutability */
  const viewportWidth = viewport?.width ?? 1;
  const isInteractiveSettling = interactiveTurn?.settling === true;
  const panGesture = useMemo(
    () => Gesture.Pan()
      .minDistance(2)
      .onBegin((event) => {
        'worklet';
        if (isInteractiveSettling) {
          gestureStarted.value = false;
          return;
        }
        gestureStarted.value = true;
        gestureDirectionLocked.value = false;
        gestureDirection.value = 1;
        gestureStartX.value = event.x;
        gestureStartBookX.value = 1;
        gestureProgress.value = 0;
        scheduleOnRN(beginDrag, event.x, event.y);
      })
      .onUpdate((event) => {
        'worklet';
        if (!gestureStarted.value) return;
        if (!gestureDirectionLocked.value) {
          if (Math.abs(event.translationX) < 2) return;
          const direction: 1 | -1 = event.translationX < 0 ? 1 : -1;
          gestureDirection.value = direction;
          gestureDirectionLocked.value = true;
          gestureStartBookX.value = pageTurnStartBookXForTouch(
            gestureStartX.value,
            direction,
            viewportWidth,
          );
        }
        const direction = gestureDirection.value;
        const startBookX = gestureStartBookX.value;
        const currentBookX = bookXForGestureTravel(
          startBookX,
          event.translationX,
          direction,
          viewportWidth,
        );
        const fingerX = anchoredGestureFingerX(startBookX, currentBookX);
        gestureProgress.value = Math.max(
          postHingeTurnProgressForFingerX(fingerX, startBookX),
          visualTurnProgressForFingerX(fingerX),
        );
        scheduleOnRN(updateDrag, event.translationX, event.absoluteY, event.velocityX);
      })
      .onEnd((event) => {
        'worklet';
        if (!gestureStarted.value) return;
        const direction = gestureDirection.value;
        const startBookX = gestureStartBookX.value;
        const currentBookX = bookXForGestureTravel(
          startBookX,
          event.translationX,
          direction,
          viewportWidth,
        );
        const fingerX = anchoredGestureFingerX(startBookX, currentBookX);
        gestureProgress.value = Math.max(
          postHingeTurnProgressForFingerX(fingerX, startBookX),
          visualTurnProgressForFingerX(fingerX),
        );
        gestureStarted.value = false;
        gestureDirectionLocked.value = false;
        scheduleOnRN(endDrag, event.velocityX, event.translationX);
      })
      .onFinalize(() => {
        'worklet';
        if (gestureStarted.value) {
          gestureStarted.value = false;
          gestureDirectionLocked.value = false;
          scheduleOnRN(endDrag, 0, 0);
        }
      }),
    [
      beginDrag,
      endDrag,
      gestureDirection,
      gestureDirectionLocked,
      gestureProgress,
      gestureStartBookX,
      gestureStartX,
      gestureStarted,
      updateDrag,
      isInteractiveSettling,
      viewportWidth,
    ],
  );
  /* eslint-enable react-hooks/refs, react-hooks/immutability */
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
      if (!viewport || !isReady || interactiveTurn?.settling) {
        return;
      }
      if (x < viewport.width * 0.3) {
        handoffGeneration.current += 1;
        void session.runtime.previous();
      } else if (x > viewport.width * 0.7) {
        handoffGeneration.current += 1;
        void session.runtime.next();
      } else {
        setControlsVisible((value) => !value);
      }
    },
    [interactiveTurn?.settling, isReady, session.runtime, viewport],
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
          chapterTitle={chapterTitle}
          progressLabel={`${progressText}${progressPercentage === undefined ? '' : ` · ${progressPercentage}%`}`}
          overlayColor={readerTheme === 'dark' ? '#A3A3A3' : '#5C5C5C'}
          overlayInsets={{ left: insets.left, right: insets.right }}
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
});

function waitForPageTurn(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/** Give React's external-store subscriber and Skia two frames to paint the
 * committed target before removing the interactive source layer. */
function waitForPageHandoffFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
