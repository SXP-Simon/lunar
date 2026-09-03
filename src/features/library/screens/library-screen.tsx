import { SymbolView } from 'expo-symbols';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { SearchField } from 'heroui-native/search-field';
import { Spinner } from 'heroui-native/spinner';
import { useToast } from 'heroui-native/toast';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard, type LibraryBook } from '@/features/library/components/book-card';
import { ImportingBookCard } from '@/features/library/components/importing-book-card';
import { Fonts, MaxContentWidth, Spacing, useTheme } from '@/hooks/use-theme';
import {
  importEpubFile,
  listLibraryBooks,
  selectEpubFiles,
} from '../services/library-service';

const AppTabBarHeight = 58;

type ImportingBook = {
  readonly id: string;
  readonly title: string;
  readonly progress: number;
  readonly isWaiting: boolean;
};

type LibraryItem =
  | { readonly kind: 'book'; readonly book: LibraryBook }
  | { readonly kind: 'importing'; readonly book: ImportingBook };

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
  const [importingBooks, setImportingBooks] = useState<readonly ImportingBook[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const importIconColor = useThemeColor('accent-foreground');
  const { toast } = useToast();

  useFocusEffect(useCallback(() => {
    let active = true;
    listLibraryBooks()
      .then((records) => {
        if (active) {
          setLibraryBooks(records.map(toLibraryBook));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          toast.show({
            variant: 'danger',
            label: '书架加载失败',
            description: getErrorMessage(error),
          });
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
  }, [toast]));

  const handleImport = useCallback(async () => {
    if (isImporting) {
      return;
    }

    setIsImporting(true);
    try {
      const selectedFiles = await selectEpubFiles();
      if (selectedFiles.length === 0) {
        return;
      }

      const tasks = selectedFiles.map((file, index) => ({
        id: `import-${Date.now()}-${index}`,
        file,
      }));
      setImportingBooks(tasks.map(({ id, file }) => ({
        id,
        title: fileNameWithoutExtension(file.fileName),
        progress: 0,
        isWaiting: true,
      })));

      for (const task of tasks) {
        setImportingBooks((current) => current.map((book) => (
          book.id === task.id
            ? { ...book, isWaiting: false, progress: Math.max(book.progress, 0.01) }
            : book
        )));
        try {
          const imported = await importEpubFile(task.file, (progress) => {
            setImportingBooks((current) => current.map((book) => (
              book.id === task.id
                ? { ...book, progress: Math.max(book.progress, progress) }
                : book
            )));
          });
          setImportingBooks((current) => current.filter((book) => book.id !== task.id));
          setLibraryBooks((current) => [
            toLibraryBook(imported),
            ...current.filter((book) => book.id !== imported.id),
          ]);
          toast.show({
            variant: 'success',
            label: 'EPUB 导入完成',
            description: imported.title,
          });
        } catch (error) {
          setImportingBooks((current) => current.filter((book) => book.id !== task.id));
          toast.show({
            variant: 'danger',
            label: 'EPUB 导入失败',
            description: `${task.file.fileName}：${getErrorMessage(error)}`,
          });
        }
      }
    } catch (error) {
      toast.show({
        variant: 'danger',
        label: '无法选择 EPUB',
        description: getErrorMessage(error),
      });
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, toast]);

  const items = useMemo<readonly LibraryItem[]>(() => {
    const keyword = query.trim().toLocaleLowerCase();
    const filteredBooks = keyword
      ? libraryBooks.filter((book) =>
        `${book.title} ${book.author}`.toLocaleLowerCase().includes(keyword),
      )
      : libraryBooks;

    return [
      ...importingBooks.map((book) => ({ kind: 'importing' as const, book })),
      ...filteredBooks.map((book) => ({ kind: 'book' as const, book })),
    ];
  }, [importingBooks, libraryBooks, query]);

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
            data={items}
            keyExtractor={(item) => item.book.id}
            numColumns={3}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={styles.row}
            contentContainerStyle={[
              styles.grid,
              { paddingBottom: AppTabBarHeight + insets.bottom + Spacing.four },
            ]}
            renderItem={({ item }) => (
              item.kind === 'importing' ? (
                <ImportingBookCard
                  isWaiting={item.book.isWaiting}
                  progress={item.book.progress}
                  title={item.book.title}
                />
              ) : (
                <BookCard
                  book={item.book}
                  onPress={() => router.push(`/reader/${encodeURIComponent(item.book.id)}` as Href)}
                />
              )
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
    readingProgress: record.readingProgress ?? 0,
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

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.epub$/i, '') || fileName;
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
