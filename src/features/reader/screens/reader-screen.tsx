import { useLocalSearchParams, useRouter } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { Spinner } from 'heroui-native/spinner';
import { useCallback, useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  SafeAreaListener,
  useSafeAreaInsets,
  type EdgeInsets,
  type SafeAreaListenerProps,
} from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { IconTabBar } from '@/components/ui/icon-tab-bar';
import type { ReaderViewport } from '@/reader';
import { ReaderSurface, useReaderPageTurn } from '@/reader/native';
import { useReaderStore } from '@/stores';
import { ProgressDrawer } from '../components/bottom-tabs/progress-drawer';
import { TocDrawer } from '../components/bottom-tabs/toc-drawer';
import { TypographyDrawer } from '../components/bottom-tabs/typography-drawer';
import { ReaderControls } from '../components/reader-controls';
import { useReaderSession } from '../hooks/use-reader-session';

// The canvas covers the window; these values only keep page content away from its edges.
const ReaderSurfaceTopSpacing = 4;
const ReaderSurfaceBottomSpacing = 4;

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reservedInsets, setReservedInsets] = useState(insets);
  const { theme } = useUniwind();
  const [viewport, setViewport] = useState<ReaderViewport>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [isTypographyOpen, setIsTypographyOpen] = useState(false);
  const readerTheme = theme === 'dark' ? 'dark' : 'light';
  const animationStyle = useReaderStore((state) => state.animationStyle);
  const spreadMode = useReaderStore((state) => state.typography.spreadMode);
  const contentInsets = useMemo(() => ({
    top: reservedInsets.top + ReaderSurfaceTopSpacing,
    right: reservedInsets.right,
    bottom: reservedInsets.bottom + ReaderSurfaceBottomSpacing,
    left: reservedInsets.left,
  }), [reservedInsets]);
  const session = useReaderSession({
    bookId: bookId ?? '',
    viewport,
    contentInsets,
    theme: readerTheme,
  });
  const {
    gesture: pageTurnGesture,
    interactiveTurn,
    automaticTurns,
    automaticNavigationActive,
    isSettling,
    completeAutomaticTurn,
    surfaceBinding: pageTurnSurfaceBinding,
    next,
    previous,
  } = useReaderPageTurn({
    runtime: session.runtime,
    snapshot: session.snapshot,
    viewport,
    animationStyle,
    spreadMode,
    surfaceTop: 0,
  });
  const isReady = session.snapshot.phase === 'ready';
  const chapterTitle = session.snapshot.chapterTitle
    ?? session.metadata?.title
    ?? session.book?.title
    ?? '正在读取章节';
  const bookTitle = session.book?.title
    ?? session.metadata?.title
    ?? '正在读取书籍';
  const totalSpreads = session.snapshot.totalSpreads;
  const currentSpread = session.snapshot.bookSpreadIndex ?? session.snapshot.spreadIndex;
  const progressText = totalSpreads === undefined
    ? '页码计算中'
    : `${currentSpread + 1} / ${totalSpreads}`;
  const progressPercentage = totalSpreads === undefined
    ? undefined
    : Math.round((currentSpread / Math.max(totalSpreads - 1, 1)) * 100);
  const canvasBackground = isReady
    ? session.runtime.getBackgroundColor()
    : readerTheme === 'dark'
      ? '#151515'
      : '#FAF9F6';
  const readerChromeVisible = controlsVisible || Boolean(session.errorMessage);
  const handleSafeAreaChange = useCallback<SafeAreaListenerProps['onChange']>(
    ({ insets: nextInsets }) => {
      setReservedInsets((current) => preserveLargestInsets(current, nextInsets));
    },
    [],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) => {
      const nextViewport = {
        width: Math.round(width),
        height: Math.round(height),
        pixelRatio: PixelRatio.get(),
      };
      return current?.width === nextViewport.width && current.height === nextViewport.height
        ? current
        : nextViewport;
    });
  }, []);

  const handleReadingPress = useCallback(
    (x: number) => {
      if (!viewport || !isReady || isSettling) return;
      if (x < viewport.width * 0.3) {
        void previous();
      } else if (x > viewport.width * 0.7) {
        void next();
      } else {
        setControlsVisible((value) => !value);
      }
    },
    [isReady, isSettling, next, previous, viewport],
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

  return (
    <View style={[styles.screen, { backgroundColor: canvasBackground }]}>
      <SafeAreaListener
        onChange={handleSafeAreaChange}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <StatusBar
        animated
        hidden={!readerChromeVisible}
        style={readerTheme === 'dark' ? 'light' : 'dark'}
      />
      <NavigationBar
        hidden={!readerChromeVisible}
        style={readerTheme === 'dark' ? 'dark' : 'light'}
      />

      <View
        onLayout={handleLayout}
        style={StyleSheet.absoluteFill}>
        <ReaderSurface
          runtime={session.runtime}
          snapshot={session.snapshot}
          animationStyle={animationStyle}
          spreadMode={spreadMode}
          interactiveTurn={interactiveTurn}
          automaticTurns={automaticTurns}
          automaticNavigationActive={automaticNavigationActive}
          onAutomaticTurnComplete={completeAutomaticTurn}
          pageTurnSurfaceBinding={pageTurnSurfaceBinding}
          chapterTitle={chapterTitle}
          progressLabel={`${progressText}${progressPercentage === undefined ? '' : ` · ${progressPercentage}%`}`}
          overlayColor={readerTheme === 'dark' ? '#A3A3A3' : '#5C5C5C'}
          overlayInsets={contentInsets}
          style={StyleSheet.absoluteFill}
        />
        <GestureDetector gesture={pageTurnGesture}>
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

      {readerChromeVisible && (
        <ReaderControls
          onBack={() => router.back()}
          safeAreaInsets={reservedInsets}
          bookTitle={bookTitle}
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
          safeAreaInsets={reservedInsets}
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
        snapshot={session.snapshot}
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
});

function preserveLargestInsets(current: EdgeInsets, next: EdgeInsets): EdgeInsets {
  const preserved = {
    top: Math.max(current.top, next.top),
    right: Math.max(current.right, next.right),
    bottom: Math.max(current.bottom, next.bottom),
    left: Math.max(current.left, next.left),
  };
  return preserved.top === current.top
    && preserved.right === current.right
    && preserved.bottom === current.bottom
    && preserved.left === current.left
    ? current
    : preserved;
}
