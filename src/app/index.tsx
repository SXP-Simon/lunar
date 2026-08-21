import { SymbolView } from 'expo-symbols';
import { SearchField } from 'heroui-native/search-field';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCard, type LibraryBook } from '@/features/library/components/book-card';
import { BottomTabInset, Fonts, MaxContentWidth, Spacing, useTheme } from '@/hooks/use-theme';

const BOOKS: LibraryBook[] = [
  {
    id: 'moon-and-sixpence',
    title: '月亮与六便士',
    author: '毛姆',
    cover: {
      background: '#1D2726',
      accent: '#DCA659',
      foreground: '#F5EBD5',
      mark: '月',
    },
  },
  {
    id: 'night-train',
    title: '夜航西飞',
    author: '柏瑞尔·马卡姆',
    cover: {
      background: '#C8D2C6',
      accent: '#354B42',
      foreground: '#23312C',
      mark: '夜',
    },
  },
  {
    id: 'long-goodbye',
    title: '漫长的告别',
    author: '雷蒙德·钱德勒',
    cover: {
      background: '#B95035',
      accent: '#F1C86B',
      foreground: '#FFF5DF',
      mark: '别',
    },
  },
  {
    id: 'walden',
    title: '瓦尔登湖',
    author: '亨利·戴维·梭罗',
    cover: {
      background: '#D8CBB0',
      accent: '#61715A',
      foreground: '#2D382C',
      mark: '湖',
    },
  },
  {
    id: 'snow-country',
    title: '雪国',
    author: '川端康成',
    cover: {
      background: '#D9E2E7',
      accent: '#667986',
      foreground: '#24343D',
      mark: '雪',
    },
  },
];

function AddBookTile() {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="添加书籍"
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
      <View
        style={[
          styles.addCover,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <View style={[styles.addIcon, { backgroundColor: theme.surface }]}>
          <SymbolView
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={27}
            tintColor={theme.textSecondary}
          />
        </View>
        <Text style={[styles.addHint, { color: theme.textSecondary }]}>导入 EPUB</Text>
      </View>
      <Text numberOfLines={1} style={[styles.bookName, { color: theme.text }]}>添加书籍</Text>
      <Text style={[styles.bookAuthor, { color: theme.textSecondary }]}>从本机选择</Text>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const [query, setQuery] = useState('');
  const theme = useTheme();
  const books = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return BOOKS;

    return BOOKS.filter((book) =>
      `${book.title} ${book.author}`.toLocaleLowerCase().includes(keyword),
    );
  }, [query]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.page}>
          <View style={styles.searchArea}>
            <SearchField value={query} onChange={setQuery}>
              <SearchField.Group className="h-12 rounded-2xl bg-field shadow-field">
                <SearchField.SearchIcon iconProps={{ size: 20, color: theme.textSecondary }} />
                <SearchField.Input
                  placeholder="搜索书名或作者"
                  accessibilityLabel="搜索书架"
                  className="text-base"
                />
                <SearchField.ClearButton accessibilityLabel="清空搜索" />
              </SearchField.Group>
            </SearchField>
          </View>

          <FlatList
            data={books}
            keyExtractor={(book) => book.id}
            numColumns={3}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => <BookCard book={item} />}
            ListFooterComponent={!query ? <AddBookTile /> : null}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>没有找到相关书籍</Text>
                <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>尝试搜索其他书名或作者</Text>
              </View>
            }
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  page: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  searchArea: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  grid: {
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === 'web' ? 112 : BottomTabInset + Spacing.four,
  },
  row: {
    alignItems: 'flex-start',
  },
  tile: {
    width: '33.3333%',
    paddingHorizontal: 6,
    marginBottom: Spacing.four,
  },
  tilePressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  addCover: {
    width: '100%',
    aspectRatio: 2 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    gap: 11,
  },
  addIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addHint: {
    fontSize: 10,
    letterSpacing: 0.5,
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
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.four,
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 20,
    fontWeight: '600',
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 13,
  },
});
