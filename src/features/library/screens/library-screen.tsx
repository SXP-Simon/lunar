import { SymbolView } from 'expo-symbols';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { SearchField } from 'heroui-native/search-field';
import { Spinner } from 'heroui-native/spinner';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_TAB_BAR_HEIGHT } from '@/components/ui/app-tabs';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import {
  FloatingActionToolbar,
  type FloatingToolbarAction,
} from '@/components/ui/floating-action-toolbar';
import { BookCard, type LibraryBook } from '@/features/library/components/book-card';
import { ImportingBookCard } from '@/features/library/components/importing-book-card';
import {
  LIBRARY_GRID_HORIZONTAL_PADDING,
  LIBRARY_GRID_TOP_PADDING,
  LibraryGridSelectionSession,
} from '@/features/library/components/library-grid-selection';
import { Fonts, MaxContentWidth, Spacing, useTheme } from '@/hooks/use-theme';
import {
  importEpubFile,
  listLibraryBooks,
  removeLibraryBooks,
  selectEpubFiles,
} from '../services/library-service';

const SELECTION_TOOLBAR_HEIGHT = 64;

type ImportingBook = {
  readonly id: string;
  readonly title: string;
  readonly progress: number;
  readonly isWaiting: boolean;
};

type LibraryItem =
  | { readonly kind: 'book'; readonly book: LibraryBook }
  | { readonly kind: 'importing'; readonly book: ImportingBook };

export default function LibraryScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [importingBooks, setImportingBooks] = useState<readonly ImportingBook[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const importIconColor = useThemeColor('accent-foreground');
  const { toast } = useToast();
  const [gridSelectionSession] = useState(() => new LibraryGridSelectionSession());
  const gridContainerRef = useRef<View>(null);
  const selectedBookIdsRef = useRef(selectedBookIds);
  const slidingSelectionValueRef = useRef(true);

  useEffect(() => {
    selectedBookIdsRef.current = selectedBookIds;
  }, [selectedBookIds]);

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

  const visibleBookIds = useMemo(
    () => items.flatMap((item) => item.kind === 'book' ? [item.book.id] : []),
    [items],
  );
  const allVisibleBooksSelected =
    visibleBookIds.length > 0
    && visibleBookIds.every((bookId) => selectedBookIds.has(bookId));

  useEffect(() => {
    gridSelectionSession.update({
      itemIds: items.map((item) => item.kind === 'book' ? item.book.id : undefined),
    });
  }, [gridSelectionSession, items]);

  const updateBookSelection = useCallback((bookIds: readonly string[], selected: boolean) => {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      for (const bookId of bookIds) {
        if (selected) {
          next.add(bookId);
        } else {
          next.delete(bookId);
        }
      }
      return next;
    });
  }, []);

  const handleBookPress = useCallback((book: LibraryBook) => {
    if (isSelectionMode) {
      updateBookSelection([book.id], !selectedBookIds.has(book.id));
      return;
    }
    router.push(`/reader/${encodeURIComponent(book.id)}` as Href);
  }, [isSelectionMode, router, selectedBookIds, updateBookSelection]);

  const selectBooksAtGridPoint = useCallback((x: number, y: number) => {
    const newlyVisitedIds = gridSelectionSession.continueFromWindow({ x, y });
    if (newlyVisitedIds.length > 0) {
      setIsSelectionMode(true);
      updateBookSelection(newlyVisitedIds, slidingSelectionValueRef.current);
    }
  }, [gridSelectionSession, updateBookSelection]);

  const beginSlidingSelection = useCallback((x: number, y: number) => {
    const newlyVisitedIds = gridSelectionSession.beginFromWindow({ x, y });
    if (newlyVisitedIds.length > 0) {
      const shouldSelect = !selectedBookIdsRef.current.has(newlyVisitedIds[0]);
      slidingSelectionValueRef.current = shouldSelect;
      setIsSelectionMode(true);
      updateBookSelection(newlyVisitedIds, shouldSelect);
    }
  }, [gridSelectionSession, updateBookSelection]);

  const finishSlidingSelection = useCallback(() => {
    gridSelectionSession.finish();
    slidingSelectionValueRef.current = true;
  }, [gridSelectionSession]);

  const closeSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedBookIds(new Set());
  }, []);

  const handleSelectAll = useCallback(() => {
    if (allVisibleBooksSelected) {
      updateBookSelection(visibleBookIds, false);
    } else {
      updateBookSelection(visibleBookIds, true);
    }
  }, [allVisibleBooksSelected, updateBookSelection, visibleBookIds]);

  const handleDeleteSelectedBooks = useCallback(async () => {
    const ids = Array.from(selectedBookIds);
    if (ids.length === 0 || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await removeLibraryBooks(ids);
      const removedIdSet = new Set(result.removedIds);
      setLibraryBooks((current) => current.filter((book) => !removedIdSet.has(book.id)));
      setIsDeleteDialogOpen(false);
      closeSelectionMode();
      toast.show({
        variant: 'success',
        label: `已删除 ${result.removedIds.length} 本书`,
      });
      if (result.fileCleanupFailedIds.length > 0) {
        toast.show({
          variant: 'danger',
          label: '部分书籍文件清理失败',
          description: '书架记录已经移除，可稍后清理应用存储。',
        });
      }
    } catch (error) {
      toast.show({
        variant: 'danger',
        label: '书籍删除失败',
        description: getErrorMessage(error),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [closeSelectionMode, isDeleting, selectedBookIds, toast]);

  const toolbarActions = useMemo<readonly FloatingToolbarAction[]>(() => [
    {
      key: 'select-all',
      label: allVisibleBooksSelected ? '取消全选' : '全选',
      icon: {
        ios: allVisibleBooksSelected ? 'checkmark.circle.fill' : 'checkmark.circle',
        android: 'select_all',
        web: 'select_all',
      },
      isDisabled: visibleBookIds.length === 0 || isDeleting,
      onPress: handleSelectAll,
    },
    {
      key: 'delete',
      label: selectedBookIds.size > 0 ? `删除 ${selectedBookIds.size}` : '删除',
      icon: { ios: 'trash', android: 'delete', web: 'delete' },
      isDisabled: selectedBookIds.size === 0 || isDeleting,
      isDestructive: true,
      onPress: () => setIsDeleteDialogOpen(true),
    },
    {
      key: 'close',
      label: '关闭',
      icon: { ios: 'xmark', android: 'close', web: 'close' },
      isDisabled: isDeleting,
      onPress: closeSelectionMode,
    },
  ], [
    allVisibleBooksSelected,
    closeSelectionMode,
    handleSelectAll,
    isDeleting,
    selectedBookIds.size,
    visibleBookIds.length,
  ]);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    gridSelectionSession.update({ viewportWidth: event.nativeEvent.layout.width });
    gridContainerRef.current?.measureInWindow((x, y, width) => {
      gridSelectionSession.update({
        viewportWidth: width,
        windowOriginX: x,
        windowOriginY: y,
      });
    });
  }, [gridSelectionSession]);

  const handleGridScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    gridSelectionSession.update({ scrollOffset: event.nativeEvent.contentOffset.y });
  }, [gridSelectionSession]);

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

          <View
            ref={gridContainerRef}
            collapsable={false}
            style={styles.gridContainer}
            onLayout={handleGridLayout}>
            <FlatList
              data={items}
              extraData={selectedBookIds}
              keyExtractor={(item) => item.book.id}
              numColumns={3}
              keyboardShouldPersistTaps="handled"
              onScroll={handleGridScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              columnWrapperStyle={styles.row}
              contentContainerStyle={[
                styles.grid,
                {
                  paddingBottom:
                    APP_TAB_BAR_HEIGHT
                    + insets.bottom
                    + Spacing.four
                    + (isSelectionMode ? SELECTION_TOOLBAR_HEIGHT + Spacing.two : 0),
                },
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
                    isSelected={selectedBookIds.has(item.book.id)}
                    isSelectionMode={isSelectionMode}
                    onPress={() => handleBookPress(item.book)}
                    onSelectionGestureFinish={finishSlidingSelection}
                    onSelectionGestureMove={selectBooksAtGridPoint}
                    onSelectionGestureStart={beginSlidingSelection}
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

      {isSelectionMode && (
        <FloatingActionToolbar
          accessibilityLabel={`书架多选工具栏，已选择 ${selectedBookIds.size} 本书`}
          actions={toolbarActions}
          bottom={APP_TAB_BAR_HEIGHT + insets.bottom + Spacing.two}
        />
      )}

      <ConfirmModal
        confirmLabel="删除"
        confirmingLabel="正在删除"
        description={`将移除 ${selectedBookIds.size} 本书及其阅读进度和书签`}
        isConfirming={isDeleting}
        isDestructive
        isOpen={isDeleteDialogOpen}
        onConfirm={() => void handleDeleteSelectedBooks()}
        onOpenChange={setIsDeleteDialogOpen}
        title="删除选中的书籍？"
      />
    </View>
  );
}

function toLibraryBook(record: Awaited<ReturnType<typeof listLibraryBooks>>[number]): LibraryBook {
  return {
    id: record.id,
    title: record.title,
    author: record.author ?? '未知作者',
    readingProgress: record.readingProgress ?? 0,
    cover: {
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
  gridContainer: {
    flex: 1,
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
    paddingHorizontal: LIBRARY_GRID_HORIZONTAL_PADDING,
    paddingTop: LIBRARY_GRID_TOP_PADDING,
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
