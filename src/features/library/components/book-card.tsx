import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type LibraryBook = {
  id: string;
  title: string;
  author: string;
  cover: {
    background: string;
    accent: string;
    foreground: string;
    mark: string;
  };
};

type BookCardProps = {
  book: LibraryBook;
  onPress?: () => void;
};

export function BookCard({ book, onPress }: BookCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开《${book.title}》`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View
        style={[
          styles.cover,
          {
            backgroundColor: book.cover.background,
            shadowColor: book.cover.background,
          },
        ]}>
        <View style={[styles.coverRule, { backgroundColor: book.cover.accent }]} />
        <Text style={[styles.coverAuthor, { color: book.cover.foreground }]}>
          {book.author}
        </Text>
        <Text style={[styles.coverMark, { color: book.cover.accent }]}>{book.cover.mark}</Text>
        <View style={[styles.coverFooter, { borderTopColor: book.cover.accent }]}>
          <Text style={[styles.coverTitle, { color: book.cover.foreground }]} numberOfLines={2}>
            {book.title}
          </Text>
        </View>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '33.3333%',
    paddingHorizontal: 6,
    marginBottom: Spacing.four,
  },
  cardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    borderRadius: 4,
    padding: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  coverRule: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 5,
    height: '100%',
  },
  coverAuthor: {
    alignSelf: 'flex-end',
    fontSize: 8,
    letterSpacing: 1.2,
    opacity: 0.78,
  },
  coverMark: {
    flex: 1,
    textAlignVertical: 'center',
    textAlign: 'center',
    fontFamily: Fonts.serif,
    fontSize: 46,
    fontWeight: '300',
    opacity: 0.95,
  },
  coverFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  coverTitle: {
    fontFamily: Fonts.serif,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
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
});
