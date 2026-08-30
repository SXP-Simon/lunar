import { create } from 'zustand';

import {
  DEFAULT_READER_TYPOGRAPHY,
  normalizeReaderTypography,
  type ReaderSnapshot,
  type ReaderTypography,
} from '@/reader';

interface ReaderStoreState {
  readonly activeBookId?: string;
  readonly snapshot: ReaderSnapshot;
  /** Shared reading typography used by every reader session. */
  readonly typography: ReaderTypography;
  setActiveBook(bookId: string): void;
  setSnapshot(snapshot: ReaderSnapshot): void;
  setTypography(typography: ReaderTypography): void;
  updateTypography(patch: Partial<ReaderTypography>): void;
  resetTypography(): void;
  reset(): void;
}

const INITIAL_READER_SNAPSHOT: ReaderSnapshot = {
  phase: 'idle',
  revisionId: 0,
  spreadIndex: 0,
};

export const useReaderStore = create<ReaderStoreState>((set) => ({
  snapshot: INITIAL_READER_SNAPSHOT,
  typography: DEFAULT_READER_TYPOGRAPHY,
  setActiveBook: (bookId) => set({ activeBookId: bookId }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setTypography: (typography) => set({ typography: normalizeReaderTypography(typography) }),
  updateTypography: (patch) => set((state) => ({
    typography: normalizeReaderTypography({ ...state.typography, ...patch }),
  })),
  resetTypography: () => set({ typography: DEFAULT_READER_TYPOGRAPHY }),
  reset: () => set({
    activeBookId: undefined,
    snapshot: INITIAL_READER_SNAPSHOT,
    typography: DEFAULT_READER_TYPOGRAPHY,
  }),
}));
