import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { SearchField } from 'heroui-native/search-field';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
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

export default function LibraryScreen() {
  const [query, setQuery] = useState('');
  const theme = useTheme();
  const importIconColor = useThemeColor('accent-foreground');
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
            <SearchField className="flex-1" value={query} onChange={setQuery}>
              <SearchField.Group className="h-9 rounded-3xl bg-field shadow-field">
                <SearchField.SearchIcon iconProps={{ size: 20, color: theme.textSecondary }} />
                <SearchField.Input
                  placeholder="搜索书名或作者"
                  accessibilityLabel="搜索书架"
                  className="ios:focus:outline-transparent android:focus:border-transparent"
                  style={styles.searchInput}
                />
                <SearchField.ClearButton accessibilityLabel="清空搜索" />
              </SearchField.Group>
            </SearchField>
            <Button
              accessibilityLabel="导入 EPUB"
              className="h-9 rounded-full"
              hitSlop={4}
              isIconOnly
              size="sm"
              variant="primary">
              <SymbolView
                name={{ ios: 'plus', android: 'add', web: 'add' }}
                size={19}
                tintColor={importIconColor}
              />
            </Button>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  searchInput: {
    height: 36,
    minHeight: 36,
    borderRadius: 18,
    paddingTop: 0,
    paddingBottom: 0,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  grid: {
    paddingHorizontal: 10,
    paddingTop: Spacing.two,
    paddingBottom: Platform.OS === 'web' ? 112 : BottomTabInset + Spacing.four,
  },
  row: {
    alignItems: 'flex-start',
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
