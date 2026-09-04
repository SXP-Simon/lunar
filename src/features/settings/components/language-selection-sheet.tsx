import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { View } from 'react-native';

import { type LanguagePreference, useTranslation } from '@/i18n';

type LanguageSelectionSheetProps = {
  readonly isOpen: boolean;
  readonly language: LanguagePreference;
  readonly onLanguageChange: (language: LanguagePreference) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
};

const LANGUAGE_OPTIONS: readonly LanguagePreference[] = ['system', 'zh-CN', 'en'];

export function LanguageSelectionSheet({
  isOpen,
  language,
  onLanguageChange,
  onOpenChange,
}: LanguageSelectionSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay variant="blur" blurViewProps={{ intensity: 28 }} />
        <BottomSheet.Content
          backgroundClassName="bg-surface"
          contentContainerClassName="gap-2 px-6 pb-8">
          <BottomSheet.Title className="text-xl text-foreground">
            {t('settings.languageSelection')}
          </BottomSheet.Title>
          <BottomSheet.Description className="text-sm text-muted">
            {t('settings.languageSelectionDescription')}
          </BottomSheet.Description>
          <View className="mt-4 gap-2">
            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = option === language;
              return (
                <Button
                  key={option}
                  accessibilityState={{ selected: isSelected }}
                  className="justify-start rounded-2xl"
                  onPress={() => {
                    onLanguageChange(option);
                    onOpenChange(false);
                  }}
                  variant={isSelected ? 'primary' : 'secondary'}>
                  {languageLabel(option, t)}
                </Button>
              );
            })}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
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
