import { create } from 'zustand';

import type { ReaderSnapshot } from '@/reader';

interface ReaderStoreState {
  readonly activeBookId?: string;
  readonly snapshot: ReaderSnapshot;
  setActiveBook(bookId: string): void;
  setSnapshot(snapshot: ReaderSnapshot): void;
  reset(): void;
}

const INITIAL_READER_SNAPSHOT: ReaderSnapshot = {
  phase: 'idle',
  revisionId: 0,
  spreadIndex: 0,
};

export const useReaderStore = create<ReaderStoreState>((set) => ({
  snapshot: INITIAL_READER_SNAPSHOT,
  setActiveBook: (bookId) => set({ activeBookId: bookId }),
  setSnapshot: (snapshot) => set({ snapshot }),
  reset: () => set({ activeBookId: undefined, snapshot: INITIAL_READER_SNAPSHOT }),
}));
