import Constants from 'expo-constants';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind, withUniwind } from 'uniwind';

import { useMarkInitialContentReady } from '@/hooks/use-mark-initial-content-ready';
import { useTranslation } from '@/i18n';

const APP_ICON = require('../../../../assets/images/icon.png');
const WORDMARK_BLACK = require('../../../../assets/images/wordmark-black.png');
const WORDMARK_WHITE = require('../../../../assets/images/wordmark-white.png');
const Image = withUniwind(ExpoImage);

export function AboutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor('foreground');
  const { theme } = useUniwind();
  const version = Constants.expoConfig?.version;
  const year = new Date().getFullYear();
  useMarkInitialContentReady(true);

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View className="w-full max-w-[800px] flex-row items-center gap-2 self-center px-4 py-2">
        <Button
          isIconOnly
          accessibilityLabel={t('settings.backToSettings')}
          className="size-12 rounded-full"
          variant="ghost"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/settings');
          }}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={22}
            tintColor={foreground}
          />
        </Button>
        <Text accessibilityRole="header" className="min-w-0 flex-1 text-2xl font-semibold text-foreground">
          {t('settings.about')}
        </Text>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow items-center justify-between px-4 pt-12 pb-6">
        <View className="w-full max-w-[800px] items-center">
          <View className="size-36 overflow-hidden rounded-3xl bg-surface">
            <Image
              accessibilityLabel="Lunar"
              className="absolute inset-0 h-full w-full"
              contentFit="cover"
              source={APP_ICON}
            />
          </View>
          <Image
            accessibilityLabel="Lunar"
            className="mt-7 h-9 w-32"
            contentFit="contain"
            source={theme === 'dark' ? WORDMARK_WHITE : WORDMARK_BLACK}
          />
          {version ? <Text className="mt-3 text-base text-muted">{version}</Text> : null}
        </View>
        <Text className="pt-12 text-center text-sm text-muted">
          © {year} Umbrae Labs
        </Text>
      </ScrollView>
    </View>
  );
}
