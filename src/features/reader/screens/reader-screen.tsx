import { useLocalSearchParams, useRouter } from 'expo-router';
import { Spinner } from 'heroui-native/spinner';
import { useCallback, useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import type { ReaderViewport } from '@/reader';
import { ReaderSurface } from '@/reader/native';
import { ProgressDrawer } from '../components/bottom-tabs/progress-drawer';
import { TocDrawer } from '../components/bottom-tabs/toc-drawer';
import { ReaderControls } from '../components/reader-controls';
import { useReaderSession } from '../hooks/use-reader-session';

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const [viewport, setViewport] = useState<ReaderViewport>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const readerTheme = theme === 'dark' ? 'dark' : 'light';
  const session = useReaderSession({
    bookId: bookId ?? '',
    viewport,
    theme: readerTheme,
  });
  const isReady = session.snapshot.phase === 'ready';
  const chapterTitle = session.runtime.getCurrentChapterTitle()
    ?? session.metadata?.title
    ?? session.book?.title
    ?? '正在读取章节';
  const totalSpreads = session.snapshot.totalSpreads;
  const currentSpread = session.snapshot.spreadIndex;
  const progressText = totalSpreads === undefined
    ? `第 ${currentSpread + 1} 页`
    : `${currentSpread + 1} / ${totalSpreads}`;
  const progressPercentage = totalSpreads === undefined
    ? undefined
    : Math.round((currentSpread / Math.max(totalSpreads - 1, 1)) * 100);
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

  const handleOpenToc = useCallback(() => {
    setIsTocOpen(true);
  }, []);

  const handleOpenProgress = useCallback(() => {
    setIsProgressOpen(true);
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
    <View onLayout={handleLayout} style={[styles.screen, { backgroundColor: canvasBackground }]}>
      <ReaderSurface
        runtime={session.runtime}
        snapshot={session.snapshot}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          styles.chapterOverlay,
          { paddingTop: insets.top + 14, paddingLeft: insets.left + 18, paddingRight: insets.right + 18 },
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

      {(controlsVisible || Boolean(session.errorMessage)) && (
        <ReaderControls
          onBack={() => router.back()}
          onOpenToc={handleOpenToc}
          onOpenProgress={handleOpenProgress}
          title={chapterTitle}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
