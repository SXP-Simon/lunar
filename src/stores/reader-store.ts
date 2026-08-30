import { create } from 'zustand';

import {
  DEFAULT_READER_TYPOGRAPHY,
  normalizeReaderTypography,
  type ReaderSnapshot,
  type ReaderTypography,
} from '@/reader';
import type { ReaderPageAnimationStyle } from '@/reader/native';

interface ReaderStoreState {
  readonly activeBookId?: string;
  readonly snapshot: ReaderSnapshot;
  /** Shared reading typography used by every reader session. */
  readonly typography: ReaderTypography;
  /** Shared page-turn animation used by every reader surface. */
  readonly animationStyle: ReaderPageAnimationStyle;
  setActiveBook(bookId: string): void;
  setSnapshot(snapshot: ReaderSnapshot): void;
  setTypography(typography: ReaderTypography): void;
  updateTypography(patch: Partial<ReaderTypography>): void;
  setAnimationStyle(style: ReaderPageAnimationStyle): void;
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
  animationStyle: 'slide',
  setActiveBook: (bookId) => set({ activeBookId: bookId }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setTypography: (typography) => set({ typography: normalizeReaderTypography(typography) }),
  updateTypography: (patch) => set((state) => ({
    typography: normalizeReaderTypography({ ...state.typography, ...patch }),
  })),
  setAnimationStyle: (animationStyle) => set({ animationStyle }),
  resetTypography: () => set({ typography: DEFAULT_READER_TYPOGRAPHY }),
  reset: () => set({
    activeBookId: undefined,
    snapshot: INITIAL_READER_SNAPSHOT,
    typography: DEFAULT_READER_TYPOGRAPHY,
    animationStyle: 'slide',
  }),
}));
