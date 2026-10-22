import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { Text, View } from 'react-native';

import { useTranslation } from '@/i18n';

interface PluginScreenHeaderProps {
  readonly title: string;
  /** Destination when there is no screen to go back to. */
  readonly fallback: Href;
}

export function PluginScreenHeader({ title, fallback }: PluginScreenHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const foreground = useThemeColor('foreground');
  return (
    <View className="w-full max-w-[800px] flex-row items-center gap-2 self-center px-4 py-2">
      <Button
        isIconOnly
        accessibilityLabel={t('plugins.back')}
        className="size-12 rounded-full"
        variant="ghost"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace(fallback);
        }}>
        <SymbolView
          name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          size={22}
          tintColor={foreground}
        />
      </Button>
      <Text
        accessibilityRole="header"
        className="min-w-0 flex-1 text-2xl font-semibold text-foreground"
        numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
