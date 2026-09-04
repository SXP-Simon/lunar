import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStateStorage } from './mmkv-state-storage';

export type ApplicationThemeMode = 'system' | 'light' | 'dark';

interface ApplicationSettingsState {
  readonly themeMode: ApplicationThemeMode;
  setThemeMode(themeMode: ApplicationThemeMode): void;
}

type PersistedApplicationSettings = Pick<ApplicationSettingsState, 'themeMode'>;

const DEFAULT_THEME_MODE: ApplicationThemeMode = 'system';

export const useApplicationSettingsStore = create<ApplicationSettingsState>()(
  persist<ApplicationSettingsState, [], [], PersistedApplicationSettings>(
    (set) => ({
      themeMode: DEFAULT_THEME_MODE,
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: 'settings.application',
      storage: createJSONStorage(() => mmkvStateStorage),
      version: 1,
      partialize: ({ themeMode }) => ({ themeMode }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        themeMode: readThemeMode(persistedState),
      }),
    },
  ),
);

function readThemeMode(value: unknown): ApplicationThemeMode {
  if (
    typeof value === 'object'
    && value !== null
    && 'themeMode' in value
    && isThemeMode(value.themeMode)
  ) {
    return value.themeMode;
  }
  return DEFAULT_THEME_MODE;
}

function isThemeMode(value: unknown): value is ApplicationThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}
