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
  LibraryGridSelectionSession,
} from '@/features/library/components/library-grid-selection';
import { Spacing } from '@/hooks/use-theme';
import { i18n, useTranslation } from '@/i18n';
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
  const { t } = useTranslation();
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
  const insets = useSafeAreaInsets();
  const [importIconColor, searchIconColor] = useThemeColor(['accent-foreground', 'muted']);
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
          setLibraryBooks(records.map((record) => toLibraryBook(record, t)));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          toast.show({
            variant: 'danger',
            label: t('library.loadFailed'),
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
  }, [t, toast]));

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
            toLibraryBook(imported, t),
            ...current.filter((book) => book.id !== imported.id),
          ]);
          toast.show({
            variant: 'success',
            label: t('library.importCompleted'),
            description: imported.title,
          });
        } catch (error) {
          setImportingBooks((current) => current.filter((book) => book.id !== task.id));
          toast.show({
            variant: 'danger',
            label: t('library.importFailed'),
            description: `${task.file.fileName}：${getErrorMessage(error)}`,
          });
        }
      }
    } catch (error) {
      toast.show({
        variant: 'danger',
        label: t('library.cannotSelectEpub'),
        description: getErrorMessage(error),
      });
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, t, toast]);

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
        label: t('library.booksDeleted', { count: result.removedIds.length }),
      });
      if (result.fileCleanupFailedIds.length > 0) {
        toast.show({
          variant: 'danger',
          label: t('library.fileCleanupFailed'),
          description: t('library.fileCleanupFailedDescription'),
        });
      }
    } catch (error) {
      toast.show({
        variant: 'danger',
        label: t('library.deleteFailed'),
        description: getErrorMessage(error),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [closeSelectionMode, isDeleting, selectedBookIds, t, toast]);

  const toolbarActions = useMemo<readonly FloatingToolbarAction[]>(() => [
    {
      key: 'select-all',
      label: allVisibleBooksSelected ? t('action.deselectAll') : t('action.selectAll'),
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
      label: selectedBookIds.size > 0
        ? `${t('action.delete')} ${selectedBookIds.size}`
        : t('action.delete'),
      icon: { ios: 'trash', android: 'delete', web: 'delete' },
      isDisabled: selectedBookIds.size === 0 || isDeleting,
      isDestructive: true,
      onPress: () => setIsDeleteDialogOpen(true),
    },
    {
      key: 'close',
      label: t('action.close'),
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
    t,
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
    <View className="flex-1 bg-background">
      <View
        className="flex-1"
        style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
        <View className="w-full max-w-[800px] flex-1 self-center">
          <View className="flex-row items-center gap-2 px-4 pt-1 pb-2">
            <SearchField className="flex-1" value={query} onChange={setQuery}>
              <SearchField.Group className="h-9 rounded-3xl bg-field shadow-field">
                <SearchField.SearchIcon iconProps={{ size: 20, color: searchIconColor }} />
                <SearchField.Input
                  placeholder={t('library.searchPlaceholder')}
                  accessibilityLabel={t('library.searchLibrary')}
                  className="h-9 min-h-9 rounded-3xl py-0 text-sm leading-5 ios:focus:outline-transparent android:focus:border-transparent"
                  style={{ textAlignVertical: 'center', includeFontPadding: false }}
                />
                <SearchField.ClearButton accessibilityLabel={t('library.clearSearch')} />
              </SearchField.Group>
            </SearchField>
            <Button
              accessibilityLabel={t('library.importEpub')}
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
            className="flex-1"
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
              columnWrapperClassName="items-start"
              contentContainerClassName="px-[10px] pt-2"
              contentContainerStyle={{
                paddingBottom:
                  APP_TAB_BAR_HEIGHT
                  + insets.bottom
                  + Spacing.four
                  + (isSelectionMode ? SELECTION_TOOLBAR_HEIGHT + Spacing.two : 0),
              }}
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
                <View className="items-center px-6 pt-20">
                  {isLoadingLibrary && <Spinner color="default" size="md" />}
                  <Text className="font-serif text-xl font-semibold text-foreground">
                    {isLoadingLibrary
                      ? t('library.loading')
                      : query.trim()
                        ? t('library.noSearchResults')
                        : t('library.empty')}
                  </Text>
                  {!isLoadingLibrary && (
                    <Text className="mt-2 text-[13px] text-muted">
                      {query.trim() ? t('library.searchSuggestion') : t('library.importSuggestion')}
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
          accessibilityLabel={t('library.selectionToolbar', { count: selectedBookIds.size })}
          actions={toolbarActions}
          bottom={APP_TAB_BAR_HEIGHT + insets.bottom + Spacing.two}
        />
      )}

      <ConfirmModal
        confirmLabel={t('action.delete')}
        confirmingLabel={t('action.deleting')}
        description={t('library.deleteDescription', { count: selectedBookIds.size })}
        isConfirming={isDeleting}
        isDestructive
        isOpen={isDeleteDialogOpen}
        onConfirm={() => void handleDeleteSelectedBooks()}
        onOpenChange={setIsDeleteDialogOpen}
        title={t('library.deleteTitle')}
      />
    </View>
  );
}

function toLibraryBook(
  record: Awaited<ReturnType<typeof listLibraryBooks>>[number],
  t: ReturnType<typeof useTranslation>['t'],
): LibraryBook {
  return {
    id: record.id,
    title: record.title,
    author: record.author ?? t('library.unknownAuthor'),
    readingProgress: record.readingProgress ?? 0,
    cover: {
      imageUri: record.coverUri,
      mark: Array.from(record.title.trim())[0] ?? t('library.fallbackBookMark'),
    },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : i18n.t('library.unknownError');
}

function fileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.epub$/i, '') || fileName;
}
