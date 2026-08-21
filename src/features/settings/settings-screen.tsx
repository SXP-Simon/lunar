import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Uniwind, useUniwind } from 'uniwind';

import { AppearancePreviewSheet } from './components/appearance-preview-sheet';
import { SettingRow } from './components/setting-row';
import { SettingSection } from './components/setting-section';

export function SettingsScreen() {
  const { theme } = useUniwind();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const isDark = theme === 'dark';

  const handleThemeChange = (isSelected: boolean) => {
    Uniwind.setTheme(isSelected ? 'dark' : 'light');
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
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
      </SafeAreaView>

      <AppearancePreviewSheet isOpen={isPreviewOpen} onOpenChange={setIsPreviewOpen} />
    </View>
  );
}
