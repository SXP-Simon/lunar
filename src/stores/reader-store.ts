import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_READER_TYPOGRAPHY,
  normalizeReaderTypography,
  type ReaderSnapshot,
  type ReaderTypography,
} from '@/reader';
import type { ReaderPageAnimationStyle } from '@/reader/native';
import { mmkvStateStorage } from './mmkv-state-storage';

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

type PersistedReaderPreferences = Pick<
  ReaderStoreState,
  'typography' | 'animationStyle'
>;

const INITIAL_READER_SNAPSHOT: ReaderSnapshot = {
  phase: 'idle',
  revisionId: 0,
  spreadIndex: 0,
};

const DEFAULT_ANIMATION_STYLE: ReaderPageAnimationStyle = 'slide';

export const useReaderStore = create<ReaderStoreState>()(
  persist<ReaderStoreState, [], [], PersistedReaderPreferences>(
    (set) => ({
      snapshot: INITIAL_READER_SNAPSHOT,
      typography: DEFAULT_READER_TYPOGRAPHY,
      animationStyle: DEFAULT_ANIMATION_STYLE,
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
        animationStyle: DEFAULT_ANIMATION_STYLE,
      }),
    }),
    {
      name: 'settings.reader',
      storage: createJSONStorage(() => mmkvStateStorage),
      partialize: ({ typography, animationStyle }) => ({ typography, animationStyle }),
      // A build before role-based fonts persisted a flat `fontFamily`, and the
      // hydrated value is handed straight to the reader. Normalizing here rather
      // than on first write keeps `typography.fonts` total for every consumer.
      merge: (persisted, current) => {
        const preferences = (persisted ?? {}) as Partial<PersistedReaderPreferences>;
        return {
          ...current,
          ...preferences,
          typography: normalizeReaderTypography(
            preferences.typography ?? current.typography,
          ),
        };
      },
    },
  ),
);
