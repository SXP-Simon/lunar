import { Image as ExpoImage } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useThemeColor } from 'heroui-native/hooks';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { memo, useCallback, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import { Fonts, useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { configureBookSelectionGesture } from './book-selection-gesture';
import { BOOK_CARD_COVER_ASPECT_RATIO } from './library-grid-selection';

export type LibraryBook = {
  id: string;
  title: string;
  author: string;
  readingProgress?: number;
  cover: {
    imageUri?: string;
    mark: string;
  };
};

type BookCardProps = {
  book: LibraryBook;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onPress?: (book: LibraryBook) => void;
  onSelectionGestureFinish?: () => void;
  onSelectionGestureMove?: (absoluteX: number, absoluteY: number) => void;
  onSelectionGestureStart?: (absoluteX: number, absoluteY: number) => void;
};

const Image = withUniwind(ExpoImage);
const PRESS_FEEDBACK_DELAY = 100;
const PRESS_FEEDBACK_TIMING = {
  duration: 200,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

type BookCoverArtworkProps = {
  imageUri?: string;
  mark: string;
};

const BookCoverArtwork = memo(function BookCoverArtwork({
  imageUri,
  mark,
}: BookCoverArtworkProps) {
  return (
    <View className="absolute inset-0 items-center justify-center overflow-hidden rounded bg-surface-secondary">
      {imageUri ? (
        <Image
          accessible={false}
          cachePolicy="memory-disk"
          className="absolute inset-0 h-full w-full"
          contentFit="cover"
          source={imageUri}
        />
      ) : (
        <Text
          className="text-[52px] font-normal text-muted"
          style={{ fontFamily: Fonts.serif }}>
          {mark}
        </Text>
      )}
    </View>
  );
});

export const BookCard = memo(function BookCard({
  book,
  isSelected = false,
  isSelectionMode = false,
  onPress,
  onSelectionGestureFinish,
  onSelectionGestureMove,
  onSelectionGestureStart,
}: BookCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const selectedIconColor = useThemeColor('accent-foreground');
  const selectionActivatedRef = useRef(false);
  const feedbackScale = useSharedValue(1);
  const feedbackStyle = useAnimatedStyle(() => ({
    transform: [{ scale: feedbackScale.get() }],
  }));
  const resetFeedback = useCallback(() => {
    // Replacing the delayed animation also cancels feedback for quick taps and scrolling.
    feedbackScale.set(withTiming(1, PRESS_FEEDBACK_TIMING));
  }, [feedbackScale]);
  const handleGestureBegin = useCallback(() => {
    selectionActivatedRef.current = false;
    feedbackScale.set(withDelay(
      PRESS_FEEDBACK_DELAY,
      withTiming(0.95, PRESS_FEEDBACK_TIMING),
    ));
  }, [feedbackScale]);
  const handleGestureStart = useCallback((event: { absoluteX: number; absoluteY: number }) => {
    selectionActivatedRef.current = true;
    resetFeedback();
    onSelectionGestureStart?.(event.absoluteX, event.absoluteY);
  }, [onSelectionGestureStart, resetFeedback]);
  const handleGestureFinalize = useCallback(() => {
    resetFeedback();
    if (selectionActivatedRef.current) {
      onSelectionGestureFinish?.();
    }
  }, [onSelectionGestureFinish, resetFeedback]);
  const selectionGesture = useMemo(() => {
    const gesture = configureBookSelectionGesture(Gesture.Pan())
      .averageTouches(true)
      .cancelsTouchesInView(true)
      .runOnJS(true)
      .onBegin(handleGestureBegin)
      .onStart(handleGestureStart)
      .onUpdate((event) => onSelectionGestureMove?.(event.absoluteX, event.absoluteY))
      .onFinalize(handleGestureFinalize);

    return gesture;
  }, [handleGestureBegin, handleGestureFinalize, handleGestureStart, onSelectionGestureMove]);

  return (
    <GestureDetector gesture={selectionGesture}>
      <PressableFeedback
        animation={false}
        style={feedbackStyle}
        accessibilityRole="button"
        accessibilityLabel={
          isSelectionMode
            ? isSelected
              ? t('library.cancelSelection', { title: book.title })
              : t('library.selectBook', { title: book.title })
            : t('library.openBook', { title: book.title })
        }
        accessibilityState={{ selected: isSelectionMode ? isSelected : undefined }}
        onPress={() => {
          if (!selectionActivatedRef.current) {
            onPress?.(book);
          }
        }}
        className="mb-6 w-1/3 overflow-visible px-[6px]">
        <View
          className="relative w-full rounded bg-surface-secondary"
          style={{
            aspectRatio: BOOK_CARD_COVER_ASPECT_RATIO,
            elevation: 4,
            shadowColor: theme.border,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.22,
            shadowRadius: 10,
          }}>
          <BookCoverArtwork imageUri={book.cover.imageUri} mark={book.cover.mark} />
          <View
            pointerEvents="none"
            className={isSelected
              ? 'absolute inset-0 rounded bg-foreground opacity-10'
              : 'absolute inset-0 rounded bg-foreground opacity-0'}
          />
          <View
            className="absolute right-1.5 bottom-1.5 rounded-lg bg-foreground px-[5px] py-0.5">
            <Text className="text-[9px] font-semibold leading-3 text-background">
              {Math.round((book.readingProgress ?? 0) * 100)}%
            </Text>
          </View>
          <View
            pointerEvents="none"
            className={isSelected
              ? 'absolute inset-0 rounded border-[3px] border-accent opacity-100'
              : 'absolute inset-0 rounded border-[3px] border-accent opacity-0'}
          />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            className={isSelected
              ? 'absolute top-1.5 left-1.5 z-20 size-[27px] items-center justify-center rounded-full bg-accent opacity-100'
              : 'absolute top-1.5 left-1.5 z-20 size-[27px] items-center justify-center rounded-full bg-accent opacity-0'}>
            <SymbolView
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              size={17}
              tintColor={selectedIconColor}
              weight="bold"
            />
          </View>
        </View>

        <Text
          className="mt-[7px] text-xs font-semibold leading-4 text-foreground"
          numberOfLines={1}
          ellipsizeMode="tail">
          {book.title}
        </Text>
        <Text className="mt-px text-[10px] leading-[14px] text-muted" numberOfLines={1}>
          {book.author}
        </Text>
      </PressableFeedback>
    </GestureDetector>
  );
});
