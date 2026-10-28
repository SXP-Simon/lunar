import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { Text, View } from 'react-native';
import { useTranslation } from '@/i18n';

/** Steps through calendar periods; a custom range instead reopens its date picker from the label. */
export function PeriodNavigator({
  label,
  onPrevious,
  onNext,
  onEdit,
}: {
  label: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const iconColor = useThemeColor('foreground');
  if (onEdit)
    return (
      <PressableFeedback
        accessibilityRole="button"
        accessibilityLabel={`${t('statistics.customRange')}, ${label}`}
        className="min-h-11 flex-row items-center justify-center gap-1 rounded-2xl px-3"
        onPress={onEdit}>
        <Text className="text-base font-semibold text-foreground">{label}</Text>
        <SymbolView
          name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
          size={16}
          tintColor={iconColor}
        />
      </PressableFeedback>
    );
  return (
    <View className="flex-row items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        accessibilityLabel={t('statistics.previousPeriod')}
        isDisabled={!onPrevious}
        onPress={onPrevious}>
        <SymbolView
          name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          size={18}
          tintColor={iconColor}
        />
      </Button>
      <Text
        accessibilityRole="header"
        className="min-w-0 flex-1 text-center text-base font-semibold text-foreground"
        numberOfLines={1}>
        {label}
      </Text>
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        accessibilityLabel={t('statistics.nextPeriod')}
        isDisabled={!onNext}
        onPress={onNext}>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={18}
          tintColor={iconColor}
        />
      </Button>
    </View>
  );
}
