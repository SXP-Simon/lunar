import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { Text, View } from 'react-native';

import { useTranslation } from '@/i18n';

interface PluginScreenHeaderProps {
  readonly title: string;
  /** Destination when there is no screen to go back to; omit for screens without a back button. */
  readonly fallback?: Href;
  /** Opens the plugin's information and settings screen. */
  readonly settingsPluginId?: string;
}

export function PluginScreenHeader({ title, fallback, settingsPluginId }: PluginScreenHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const foreground = useThemeColor('foreground');
  return (
    <View
      className={`w-full max-w-[800px] flex-row items-center gap-2 self-center py-2 ${fallback ? 'px-4' : 'pr-4 pl-5'}`}>
      {fallback ? (
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
      ) : null}
      <Text
        accessibilityRole="header"
        className="min-w-0 flex-1 text-2xl font-semibold text-foreground"
        numberOfLines={1}>
        {title}
      </Text>
      {settingsPluginId ? (
        <Button
          isIconOnly
          accessibilityLabel={t('plugins.openSettings')}
          className="size-12 rounded-full"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: '/plugins/[pluginId]',
              params: { pluginId: settingsPluginId },
            } as unknown as Href)
          }>
          <SymbolView
            name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
            size={22}
            tintColor={foreground}
          />
        </Button>
      ) : null}
    </View>
  );
}
