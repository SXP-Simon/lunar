import { useLocalSearchParams, useRouter } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { Spinner } from 'heroui-native/spinner';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  SafeAreaListener,
  useSafeAreaInsets,
  type EdgeInsets,
  type SafeAreaListenerProps,
} from 'react-native-safe-area-context';
import { useResolveClassNames, useUniwind } from 'uniwind';

import { IconTabBar } from '@/components/ui/icon-tab-bar';
import { useTranslation } from '@/i18n';
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
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const [reservedInsets, setReservedInsets] = useState(insets);
  const { theme } = useUniwind();
  const absoluteFillStyle = useResolveClassNames('absolute inset-0');
  const [viewport, setViewport] = useState<ReaderViewport>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [isTypographyOpen, setIsTypographyOpen] = useState(false);
  const errorToastKey = useRef<string | undefined>(undefined);
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
    ?? t('reader.loadingChapter');
  const bookTitle = session.book?.title
    ?? session.metadata?.title
    ?? t('reader.loadingBook');
  const totalSpreads = session.snapshot.totalSpreads;
  const currentSpread = session.snapshot.bookSpreadIndex ?? session.snapshot.spreadIndex;
  const progressText = totalSpreads === undefined
    ? t('reader.calculatingPages')
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

  useEffect(() => {
    if (!session.errorMessage) {
      errorToastKey.current = undefined;
      return;
    }

    const nextErrorToastKey = `${bookId ?? ''}:${session.errorMessage}`;
    if (errorToastKey.current === nextErrorToastKey) {
      return;
    }

    errorToastKey.current = nextErrorToastKey;
    toast.show({
      variant: 'danger',
      label: t('reader.loadingFailed'),
      description: session.errorMessage,
    });
  }, [bookId, session.errorMessage, t, toast]);

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
        return t('reader.loadingEpub');
      case 'paginating':
        return t('reader.paginating');
      case 'reflowing':
        return t('reader.reflowing');
      default:
        return t('reader.preparing');
    }
  }, [session.snapshot.phase, t]);

  return (
    <View className="flex-1" style={{ backgroundColor: canvasBackground }}>
      <SafeAreaListener
        onChange={handleSafeAreaChange}
        pointerEvents="none"
        style={absoluteFillStyle}
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
        className="absolute inset-0">
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
          style={absoluteFillStyle}
        />
        <GestureDetector gesture={pageTurnGesture}>
          <View collapsable={false} className="absolute inset-0">
            <Pressable
              accessibilityLabel={t('reader.readerPage')}
              accessibilityRole="adjustable"
              accessibilityValue={{
                min: 1,
                max: totalSpreads ?? Math.max(1, currentSpread + 1),
                now: currentSpread + 1,
                text: progressText,
              }}
              onPress={(event) => handleReadingPress(event.nativeEvent.locationX)}
              className="absolute inset-0"
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
            { key: 'toc', accessibilityLabel: t('reader.openToc'), name: { ios: 'list.bullet', android: 'format_list_bulleted', web: 'list' } },
            { key: 'progress', accessibilityLabel: t('reader.openProgress'), name: { ios: 'chart.bar', android: 'timeline', web: 'timeline' } },
            { key: 'typography', accessibilityLabel: t('reader.openTypography'), name: { ios: 'textformat.size', android: 'format_size', web: 'format_size' } },
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
          <Text className="text-center text-xl font-semibold text-foreground">
            {t('reader.loadingFailed')}
          </Text>
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
