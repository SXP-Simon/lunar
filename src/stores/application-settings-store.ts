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
      version: 2,
      partialize: ({ themeMode, language }) => ({ themeMode, language }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        themeMode: readThemeMode(persistedState),
        language: readLanguage(persistedState),
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

function readLanguage(value: unknown): LanguagePreference {
  if (
    typeof value === 'object'
    && value !== null
    && 'language' in value
    && isLanguagePreference(value.language)
  ) {
    return value.language;
  }
  return DEFAULT_LANGUAGE;
}

function isThemeMode(value: unknown): value is ApplicationThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'zh-CN' || value === 'en';
}
