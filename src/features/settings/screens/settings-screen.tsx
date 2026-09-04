import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { useApplicationSettingsStore } from '@/stores';
import { AppearancePreviewSheet } from '../components/appearance-preview-sheet';
import { SettingRow } from '../components/setting-row';
import { SettingSection } from '../components/setting-section';

export function SettingsScreen() {
  const { theme } = useUniwind();
  const insets = useSafeAreaInsets();
  const setThemeMode = useApplicationSettingsStore((state) => state.setThemeMode);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const isDark = theme === 'dark';

  useFocusEffect(
    useCallback(() => {
      return () => setIsPreviewOpen(false);
    }, []),
  );

  const handleThemeChange = (isSelected: boolean) => {
    setThemeMode(isSelected ? 'dark' : 'light');
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
            <SettingSection title="外观">
              <SettingRow
                variant="switch"
                title="深色模式"
                description={isDark ? '深色外观已开启' : '当前使用浅色外观'}
                accessibilityLabel="深色模式"
                accessibilityHint="切换应用的浅色与深色外观"
                isSelected={isDark}
                onSelectedChange={handleThemeChange}
              />
              <SettingRow
                variant="action"
                title="外观预览"
                value={isDark ? '深色' : '浅色'}
                accessibilityHint="打开当前主题的阅读页面预览"
                onPress={() => setIsPreviewOpen(true)}
              />
            </SettingSection>
          </View>
        </ScrollView>
      </View>

      <AppearancePreviewSheet isOpen={isPreviewOpen} onOpenChange={setIsPreviewOpen} />
    </View>
  );
}
