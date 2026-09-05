import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { Text, View } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';

const ControlHorizontalPadding = 12;

interface ReaderControlsProps {
  readonly bookTitle: string;
  readonly onBack: () => void;
  readonly safeAreaInsets?: EdgeInsets;
}

export function ReaderControls({
  bookTitle,
  onBack,
  safeAreaInsets,
}: ReaderControlsProps) {
  const { t } = useTranslation();
  const contextInsets = useSafeAreaInsets();
  const insets = safeAreaInsets ?? contextInsets;

  return (
    <View className="absolute inset-0 overflow-hidden" pointerEvents="box-none">
      <View
        className="w-full self-stretch overflow-hidden bg-reader-controls pb-2"
        style={{
          paddingTop: insets.top,
          paddingLeft: Math.max(insets.left, ControlHorizontalPadding),
          paddingRight: Math.max(insets.right, ControlHorizontalPadding),
        }}>
        <View className="h-12 w-full flex-row items-center gap-2">
          <ReaderIconButton
            accessibilityLabel={t('reader.backToLibrary')}
            name={{ ios: 'chevron.backward', android: 'arrow_back', web: 'arrow_back' }}
            onPress={onBack}
          />
          <Text
            className="min-w-0 flex-1 text-center text-base font-semibold text-foreground"
            numberOfLines={1}>
            {bookTitle}
          </Text>
          <View className="size-10" />
        </View>
      </View>
    </View>
  );
}

interface ReaderIconButtonProps {
  readonly accessibilityLabel: string;
  readonly name: SymbolViewProps['name'];
  readonly onPress: () => void;
  readonly isDisabled?: boolean;
}

function ReaderIconButton({
  accessibilityLabel,
  name,
  onPress,
  isDisabled,
}: ReaderIconButtonProps) {
  const theme = useTheme();
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      className="size-10 rounded-full"
      isDisabled={isDisabled}
      isIconOnly
      onPress={onPress}
      size="sm"
      variant="ghost">
      <SymbolView name={name} size={20} tintColor={theme.text} />
    </Button>
  );
}
