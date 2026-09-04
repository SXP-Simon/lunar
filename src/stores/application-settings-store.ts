import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LanguagePreference } from '@/i18n';
import { mmkvStateStorage } from './mmkv-state-storage';

export type ApplicationThemeMode = 'system' | 'light' | 'dark';

interface ApplicationSettingsState {
  readonly themeMode: ApplicationThemeMode;
  readonly language: LanguagePreference;
  setThemeMode(themeMode: ApplicationThemeMode): void;
  setLanguage(language: LanguagePreference): void;
}

type PersistedApplicationSettings = Pick<ApplicationSettingsState, 'themeMode' | 'language'>;

const DEFAULT_THEME_MODE: ApplicationThemeMode = 'system';
const DEFAULT_LANGUAGE: LanguagePreference = 'system';

export const useApplicationSettingsStore = create<ApplicationSettingsState>()(
  persist<ApplicationSettingsState, [], [], PersistedApplicationSettings>(
    (set) => ({
      themeMode: DEFAULT_THEME_MODE,
      language: DEFAULT_LANGUAGE,
      setThemeMode: (themeMode) => set({ themeMode }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'settings.application',
      storage: createJSONStorage(() => mmkvStateStorage),
      partialize: ({ themeMode, language }) => ({ themeMode, language }),
    },
  ),
);
