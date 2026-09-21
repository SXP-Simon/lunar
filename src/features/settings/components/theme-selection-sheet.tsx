import { Select } from 'heroui-native/select';
import { Separator } from 'heroui-native/separator';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { useTranslation } from '@/i18n';
import { type ApplicationThemeMode } from '@/stores';

type ThemeSelectionSheetProps = {
  readonly isOpen: boolean;
  readonly themeMode: ApplicationThemeMode;
  readonly onThemeModeChange: (themeMode: ApplicationThemeMode) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
};

const THEME_OPTIONS: readonly ApplicationThemeMode[] = ['system', 'light', 'dark'];

export function ThemeSelectionSheet({
  isOpen,
  themeMode,
  onThemeModeChange,
  onOpenChange,
}: ThemeSelectionSheetProps) {
  const { t } = useTranslation();
  const navigationActiveColor = useCSSVariable('--color-navigation-active') as string;
  const selectedOption = {
    value: themeMode,
    label: themeLabel(themeMode, t),
  };

  return (
    <Select
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onValueChange={(option) => {
        if (option) {
          onThemeModeChange(option.value as ApplicationThemeMode);
        }
      }}
      presentation="bottom-sheet"
      value={selectedOption}>
      <Select.Portal unstable_accessibilityContainerViewIsModal>
        <Select.Overlay />
        <Select.Content
          backgroundClassName="bg-surface"
          contentContainerClassName="px-6 pb-8"
          presentation="bottom-sheet"
          snapPoints={['35%']}>
          <Select.ListLabel className="mb-2 text-xl text-foreground">
            {t('settings.themeSelection')}
          </Select.ListLabel>
          {THEME_OPTIONS.map((option, index) => (
            <View key={option}>
              <Select.Item label={themeLabel(option, t)} value={option}>
                {({ isSelected }) => (
                  <>
                    <Select.ItemLabel
                      className={isSelected ? 'text-navigation-active' : 'text-foreground'}
                    />
                    <Select.ItemIndicator iconProps={{ color: navigationActiveColor }} />
                  </>
                )}
              </Select.Item>
              {index < THEME_OPTIONS.length - 1 ? <Separator /> : null}
            </View>
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

function themeLabel(
  themeMode: ApplicationThemeMode,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (themeMode) {
    case 'dark':
      return t('settings.dark');
    case 'light':
      return t('settings.light');
    default:
      return t('settings.systemTheme');
  }
}
