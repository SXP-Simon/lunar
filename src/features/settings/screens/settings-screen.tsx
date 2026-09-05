import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { type LanguagePreference, useTranslation } from '@/i18n';
import { useMarkInitialContentReady } from '@/hooks/use-mark-initial-content-ready';
import { useApplicationSettingsStore } from '@/stores';
import { LanguageSelectionSheet } from '../components/language-selection-sheet';
import { SettingRow } from '../components/setting-row';
import { SettingSection } from '../components/setting-section';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const insets = useSafeAreaInsets();
  useMarkInitialContentReady(true);
  const setThemeMode = useApplicationSettingsStore((state) => state.setThemeMode);
  const language = useApplicationSettingsStore((state) => state.language);
  const setLanguage = useApplicationSettingsStore((state) => state.setLanguage);
  const resumeReadingOnLaunch = useApplicationSettingsStore(
    (state) => state.resumeReadingOnLaunch,
  );
  const setResumeReadingOnLaunch = useApplicationSettingsStore(
    (state) => state.setResumeReadingOnLaunch,
  );
  const [isLanguageSelectionOpen, setIsLanguageSelectionOpen] = useState(false);
  const isDark = theme === 'dark';

  useFocusEffect(
    useCallback(() => {
      return () => {
        setIsLanguageSelectionOpen(false);
      };
    }, []),
  );

  const handleThemeChange = (isSelected: boolean) => {
    setThemeMode(isSelected ? 'dark' : 'light');
  };

  const handleLanguageChange = (nextLanguage: LanguagePreference) => {
    setLanguage(nextLanguage);
  };

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-1"
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="grow px-4 pt-4 pb-32">
          <View className="w-full max-w-[800px] self-center">
            <SettingSection title={t('settings.appearance')}>
              <SettingRow
                variant="switch"
                title={t('settings.darkMode')}
                description={isDark ? t('settings.darkModeEnabled') : t('settings.lightModeActive')}
                accessibilityLabel={t('settings.darkMode')}
                accessibilityHint={t('settings.darkModeHint')}
                isSelected={isDark}
                onSelectedChange={handleThemeChange}
              />
              <SettingRow
                variant="action"
                title={t('settings.language')}
                description={t('settings.languageDescription')}
                value={languageLabel(language, t)}
                accessibilityHint={t('settings.languageHint')}
                onPress={() => setIsLanguageSelectionOpen(true)}
              />
            </SettingSection>
            <View className="mt-8">
              <SettingSection title={t('settings.reading')}>
                <SettingRow
                  variant="switch"
                  title={t('settings.resumeReadingOnLaunch')}
                  description={t('settings.resumeReadingOnLaunchDescription')}
                  accessibilityLabel={t('settings.resumeReadingOnLaunch')}
                  accessibilityHint={t('settings.resumeReadingOnLaunchHint')}
                  isSelected={resumeReadingOnLaunch}
                  onSelectedChange={setResumeReadingOnLaunch}
                />
              </SettingSection>
            </View>
          </View>
        </ScrollView>
      </View>

      <LanguageSelectionSheet
        isOpen={isLanguageSelectionOpen}
        language={language}
        onLanguageChange={handleLanguageChange}
        onOpenChange={setIsLanguageSelectionOpen}
      />
    </View>
  );
}

function languageLabel(
  language: LanguagePreference,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (language) {
    case 'zh-CN':
      return t('settings.chinese');
    case 'en':
      return t('settings.english');
    default:
      return t('settings.systemLanguage');
  }
}
