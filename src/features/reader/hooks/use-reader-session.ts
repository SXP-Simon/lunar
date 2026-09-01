import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { findLibraryBookById, type LibraryBookRecord } from '@/features/library';
import {
  createReaderTypographyKey,
  type ReaderContentInsets,
  type ReaderSnapshot,
  type ReaderOpenResult,
  type ReaderTheme,
  type ReaderViewport,
} from '@/reader';
import {
  LunarReaderRuntime,
  RitoNativePaginationBackend,
} from '@/reader/native';
import { createLunarRitoPinnedFonts } from '@/reader/rito/pinned-font';
import { useReaderStore } from '@/stores';
import { readReaderBook } from '../infrastructure/expo-reader-book-loader';
import type { ReaderReadingState } from '../domain/reader-reading-state';
import { findReaderReadingState, saveReaderReadingState } from '../services/reading-state-service';

export interface ReaderSessionOptions {
  readonly bookId: string;
  readonly viewport?: ReaderViewport;
  readonly contentInsets?: ReaderContentInsets;
  readonly theme: ReaderTheme;
}

export function useReaderSession({ bookId, viewport, contentInsets, theme }: ReaderSessionOptions) {
  const typography = useReaderStore((state) => state.typography);
  const runtime = useMemo(
    () =>
      createReaderRuntime(),
    [],
  );
  const [book, setBook] = useState<LibraryBookRecord>();
  const [openResult, setOpenResult] = useState<{
    bookId: string;
    result: ReaderOpenResult;
  }>();
  const [readingState, setReadingState] = useState<{
    bookId: string;
    state?: ReaderReadingState;
  }>();
  const [bookError, setBookError] = useState<{ bookId: string; message: string }>();
  const activeBookId = useRef<string | undefined>(undefined);
  const layoutKey = useRef<string | undefined>(undefined);
  const saveQueue = useRef(Promise.resolve());
  const subscribe = useCallback(
    (listener: () => void) => runtime.subscribe(listener),
    [runtime],
  );
  const getSnapshot = useCallback(() => runtime.getSnapshot(), [runtime]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const currentBook = book?.id === bookId ? book : undefined;
  const currentOpenResult = openResult?.bookId === bookId ? openResult.result : undefined;
  const persistSnapshot = useCallback((currentSnapshot: ReaderSnapshot) => {
    if (
      !currentBook ||
      currentSnapshot.bookId !== currentBook.id ||
      currentSnapshot.phase !== 'ready' ||
      !currentSnapshot.position
    ) {
      return;
    }
    const state: ReaderReadingState = {
      bookId: currentBook.id,
      position: currentSnapshot.position,
      totalSpreads: currentSnapshot.totalSpreads,
      typography,
      theme,
      updatedAt: Date.now(),
    };
    saveQueue.current = saveQueue.current
      .then(() => saveReaderReadingState(state))
      .catch(() => undefined);
  }, [currentBook, saveQueue, theme, typography]);

  useEffect(() => {
    let active = true;
    findReaderReadingState(bookId)
      .then((state) => {
        if (active) {
          setReadingState({ bookId, state });
        }
      })
      .catch(() => {
        if (active) {
          setReadingState({ bookId });
        }
      });
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
    if (
      !currentBook ||
      readingState?.bookId !== bookId ||
      !viewport ||
      viewport.width < 1 ||
      viewport.height < 1
    ) {
      return;
    }
    const nextLayoutKey = [
      currentBook.id,
      viewport.width,
      viewport.height,
      viewport.pixelRatio,
      contentInsets?.top ?? 0,
      contentInsets?.right ?? 0,
      contentInsets?.bottom ?? 0,
      contentInsets?.left ?? 0,
      theme,
      createReaderTypographyKey(typography),
    ].join(':');
    if (layoutKey.current === nextLayoutKey) {
      return;
    }
    layoutKey.current = nextLayoutKey;

    const layout = {
      viewport,
      contentInsets,
      typography,
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
        restorePosition: readingState.state?.position,
      })
      .then((result) => setOpenResult({ bookId: currentBook.id, result }))
      .catch(() => undefined);
  }, [bookId, contentInsets, currentBook, readingState, runtime, theme, typography, viewport]);

  useEffect(() => {
    persistSnapshot(snapshot);
  }, [persistSnapshot, snapshot]);

  useEffect(
    () => () => {
      persistSnapshot(runtime.getSnapshot());
      void runtime.close();
    },
    [persistSnapshot, runtime],
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

function createReaderRuntime(): LunarReaderRuntime {
  return new LunarReaderRuntime(
    (request) => readReaderBook(request.fileUri),
    new RitoNativePaginationBackend({
      pinnedFonts: () => createLunarRitoPinnedFonts(),
    }),
  );
}
