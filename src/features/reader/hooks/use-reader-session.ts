import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { findLibraryBookById, type LibraryBookRecord } from '@/features/library';
import {
  createReaderTypographyKey,
  DEFAULT_READER_TYPOGRAPHY,
  type ReaderOpenResult,
  type ReaderTheme,
  type ReaderViewport,
} from '@/reader';
import { LunarReaderRuntime } from '@/reader/native';
import { readReaderBook } from '../infrastructure/expo-reader-book-loader';

export interface ReaderSessionOptions {
  readonly bookId: string;
  readonly viewport?: ReaderViewport;
  readonly theme: ReaderTheme;
}

export function useReaderSession({ bookId, viewport, theme }: ReaderSessionOptions) {
  const runtime = useMemo(
    () =>
      new LunarReaderRuntime((request) => readReaderBook(request.fileUri)),
    [],
  );
  const [book, setBook] = useState<LibraryBookRecord>();
  const [openResult, setOpenResult] = useState<{
    bookId: string;
    result: ReaderOpenResult;
  }>();
  const [bookError, setBookError] = useState<{ bookId: string; message: string }>();
  const activeBookId = useRef<string | undefined>(undefined);
  const layoutKey = useRef<string | undefined>(undefined);
  const subscribe = useCallback(
    (listener: () => void) => runtime.subscribe(listener),
    [runtime],
  );
  const getSnapshot = useCallback(() => runtime.getSnapshot(), [runtime]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const currentBook = book?.id === bookId ? book : undefined;
  const currentOpenResult = openResult?.bookId === bookId ? openResult.result : undefined;

  useEffect(() => {
    let active = true;
    findLibraryBookById(bookId)
      .then((record) => {
        if (!active) {
          return;
        }
        if (record) {
          setBook(record);
        } else {
          setBookError({ bookId, message: '书架中没有找到这本书。' });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setBookError({
            bookId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (!currentBook || !viewport || viewport.width < 1 || viewport.height < 1) {
      return;
    }
    const nextLayoutKey = [
      currentBook.id,
      viewport.width,
      viewport.height,
      viewport.pixelRatio,
      theme,
      createReaderTypographyKey(DEFAULT_READER_TYPOGRAPHY),
    ].join(':');
    if (layoutKey.current === nextLayoutKey) {
      return;
    }
    layoutKey.current = nextLayoutKey;

    const layout = {
      viewport,
      typography: DEFAULT_READER_TYPOGRAPHY,
      theme,
    };
    if (activeBookId.current === currentBook.id && runtime.getSnapshot().phase === 'ready') {
      void runtime.updateLayout(layout).catch(() => undefined);
      return;
    }

    activeBookId.current = currentBook.id;
    void runtime
      .open({
        bookId: currentBook.id,
        fileUri: currentBook.fileUri,
        ...layout,
      })
      .then((result) => setOpenResult({ bookId: currentBook.id, result }))
      .catch(() => undefined);
  }, [currentBook, runtime, theme, viewport]);

  useEffect(
    () => () => {
      void runtime.close();
    },
    [runtime],
  );

  return {
    runtime,
    snapshot,
    book: currentBook,
    metadata: currentOpenResult?.metadata,
    toc: currentOpenResult?.toc ?? [],
    errorMessage:
      (bookError?.bookId === bookId ? bookError.message : undefined) ??
      snapshot.errorMessage,
  };
}
