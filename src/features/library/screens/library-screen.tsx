import { SymbolView } from 'expo-symbols';
import { type Href, useRouter } from 'expo-router';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { SearchField } from 'heroui-native/search-field';
import { Spinner } from 'heroui-native/spinner';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard, type LibraryBook } from '@/features/library/components/book-card';
import { Fonts, MaxContentWidth, Spacing, useTheme } from '@/hooks/use-theme';
import { listLibraryBooks, pickAndImportEpub } from '../services/library-service';

const AppTabBarHeight = 58;

const COVER_PALETTES: readonly LibraryBook['cover'][] = [
  {
    background: '#1D2726',
    accent: '#DCA659',
    foreground: '#F5EBD5',
    mark: '',
  },
  {
    background: '#C8D2C6',
    accent: '#354B42',
    foreground: '#23312C',
    mark: '',
  },
  {
    background: '#B95035',
    accent: '#F1C86B',
    foreground: '#FFF5DF',
    mark: '',
  },
  {
    background: '#D8CBB0',
    accent: '#61715A',
    foreground: '#2D382C',
    mark: '',
  },
  {
    background: '#D9E2E7',
    accent: '#667986',
    foreground: '#24343D',
    mark: '',
  },
];

export default function LibraryScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const importIconColor = useThemeColor('accent-foreground');

  const loadBooks = useCallback(async () => {
    const records = await listLibraryBooks();
    setLibraryBooks(records.map(toLibraryBook));
  }, []);

  useEffect(() => {
    let active = true;
    listLibraryBooks()
      .then((records) => {
        if (active) {
          setLibraryBooks(records.map(toLibraryBook));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          Alert.alert('书架加载失败', getErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingLibrary(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleImport = useCallback(async () => {
    if (isImporting) {
      return;
    }

    setIsImporting(true);
    try {
      const imported = await pickAndImportEpub();
      if (imported) {
        await loadBooks();
      }
    } catch (error) {
      Alert.alert('EPUB 导入失败', getErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, loadBooks]);

  const books = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return libraryBooks;

    return libraryBooks.filter((book) =>
      `${book.title} ${book.author}`.toLocaleLowerCase().includes(keyword),
    );
  }, [libraryBooks, query]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.safeArea,
          {
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}>
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
              isDisabled={isImporting}
              isIconOnly
              onPress={() => void handleImport()}
              size="sm"
              variant="primary">
              {isImporting ? (
                <Spinner color={importIconColor} size="sm" />
              ) : (
                <SymbolView
                  name={{ ios: 'plus', android: 'add', web: 'add' }}
                  size={19}
                  tintColor={importIconColor}
                />
              )}
            </Button>
          </View>

          <FlatList
            data={books}
            keyExtractor={(book) => book.id}
            numColumns={3}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={styles.row}
            contentContainerStyle={[
              styles.grid,
              { paddingBottom: AppTabBarHeight + insets.bottom + Spacing.four },
            ]}
            renderItem={({ item }) => (
              <BookCard
                book={item}
                onPress={() => router.push(`/reader/${encodeURIComponent(item.id)}` as Href)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {isLoadingLibrary && <Spinner color="default" size="md" />}
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {isLoadingLibrary
                    ? '正在读取书架'
                    : query.trim()
                      ? '没有找到相关书籍'
                      : '书架还是空的'}
                </Text>
                {!isLoadingLibrary && (
                  <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                    {query.trim() ? '尝试搜索其他书名或作者' : '使用右上角的添加按钮导入 EPUB'}
                  </Text>
                )}
              </View>
            }
          />
        </View>
      </View>
    </View>
  );
}

function toLibraryBook(record: Awaited<ReturnType<typeof listLibraryBooks>>[number]): LibraryBook {
  const seed = Array.from(record.sha256).reduce(
    (value, character) => value + character.charCodeAt(0),
    0,
  );
  const palette = COVER_PALETTES[seed % COVER_PALETTES.length] ?? COVER_PALETTES[0]!;
  return {
    id: record.id,
    title: record.title,
    author: record.author ?? '未知作者',
    cover: {
      ...palette,
      imageUri: record.coverUri,
      mark: Array.from(record.title.trim())[0] ?? '书',
    },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生了未知错误。';
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
