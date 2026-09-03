import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useThemeColor } from 'heroui-native/hooks';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing, useTheme } from '@/hooks/use-theme';
import {
  BOOK_CARD_COVER_ASPECT_RATIO,
  BOOK_CARD_HORIZONTAL_PADDING,
} from './library-grid-selection';

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
  onLongPress?: () => void;
  onPress?: () => void;
};

export function BookCard({
  book,
  isSelected = false,
  isSelectionMode = false,
  onLongPress,
  onPress,
}: BookCardProps) {
  const theme = useTheme();
  const selectedIconColor = useThemeColor('accent-foreground');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isSelectionMode
          ? `${isSelected ? '取消选择' : '选择'}《${book.title}》`
          : `打开《${book.title}》`
      }
      accessibilityState={{ selected: isSelectionMode ? isSelected : undefined }}
      delayLongPress={360}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.cover,
              isSelected && styles.coverSelected,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: isSelected ? theme.accent : 'transparent',
                shadowColor: theme.border,
              },
            ]}>
            {book.cover.imageUri && (
              <Image
                accessible={false}
                cachePolicy="disk"
                contentFit="cover"
                recyclingKey={book.id}
                source={book.cover.imageUri}
                style={styles.coverImage}
                transition={120}
              />
            )}
            {!book.cover.imageUri && (
              <Text style={[styles.coverMark, { color: theme.textSecondary }]}>
                {book.cover.mark}
              </Text>
            )}
            <View
              style={[
                styles.progressBadge,
                isSelected ? styles.progressBadgeSelected : styles.progressBadgeDefault,
                { backgroundColor: theme.text },
              ]}>
              <Text style={[styles.progressText, { color: theme.background }]}>
                {Math.round((book.readingProgress ?? 0) * 100)}%
              </Text>
            </View>
            {isSelected && (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.selectionBadge, { backgroundColor: theme.accent }]}>
                <SymbolView
                  name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                  size={17}
                  tintColor={selectedIconColor}
                  weight="bold"
                />
              </View>
            )}
            {isSelected && (
              <View
                pointerEvents="none"
                style={[styles.selectedOverlay, { backgroundColor: theme.text }]}
              />
            )}
            {pressed && (
              <View
                pointerEvents="none"
                style={[
                  styles.coverPressedOverlay,
                  { backgroundColor: theme.text },
                ]}
              />
            )}
          </View>

          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.bookName, { color: theme.text }]}>
            {book.title}
          </Text>
          <Text numberOfLines={1} style={[styles.bookAuthor, { color: theme.textSecondary }]}>
            {book.author}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '33.3333%',
    paddingHorizontal: BOOK_CARD_HORIZONTAL_PADDING,
    marginBottom: Spacing.four,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
  },
  cover: {
    width: '100%',
    aspectRatio: BOOK_CARD_COVER_ASPECT_RATIO,
    overflow: 'hidden',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  coverSelected: {
    borderWidth: 3,
  },
  coverImage: {
    position: 'absolute',
    inset: 0,
  },
  coverPressedOverlay: {
    position: 'absolute',
    inset: 0,
    opacity: 0.12,
  },
  selectedOverlay: {
    position: 'absolute',
    inset: 0,
    opacity: 0.1,
  },
  coverMark: {
    fontFamily: Fonts.serif,
    fontSize: 52,
    fontWeight: '400',
  },
  bookName: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  bookAuthor: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 14,
  },
  progressBadge: {
    position: 'absolute',
    bottom: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  progressBadgeDefault: {
    right: 6,
  },
  progressBadgeSelected: {
    left: 6,
  },
  selectionBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 27,
    height: 27,
    zIndex: 2,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
  },
});
