import { SymbolView } from 'expo-symbols';
import { Switch } from 'heroui-native/switch';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Uniwind, useUniwind } from 'uniwind';

import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const { theme: currentTheme } = useUniwind();
  const theme = useTheme();
  const isDark = currentTheme === 'dark';

  const handleThemeChange = (selected: boolean) => {
    Uniwind.setTheme(selected ? 'dark' : 'light');
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.page}>
            <Text style={[styles.eyebrow, { color: theme.accent }]}>PREFERENCES</Text>
            <Text style={[styles.heading, { color: theme.text }]}>设置</Text>
            <Text style={[styles.intro, { color: theme.textSecondary }]}>调整 Lunar 的阅读外观。</Text>

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>外观</Text>
            <View
              style={[
                styles.settingCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              <View style={[styles.iconWell, { backgroundColor: theme.accentSoft }]}>
                <SymbolView
                  name={{
                    ios: isDark ? 'moon.stars.fill' : 'sun.max.fill',
                    android: isDark ? 'dark_mode' : 'light_mode',
                    web: isDark ? 'dark_mode' : 'light_mode',
                  }}
                  size={22}
                  tintColor={theme.accent}
                />
              </View>

              <View style={styles.settingCopy}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>深色模式</Text>
                <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                  {isDark ? '深色外观已开启' : '当前使用浅色外观'}
                </Text>
              </View>

              <Switch
                isSelected={isDark}
                onSelectedChange={handleThemeChange}
                accessibilityLabel="切换深色模式"
                className="h-8 w-14">
                <Switch.Thumb className="size-6" />
              </Switch>
            </View>

            <View
              style={[
                styles.preview,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={[styles.previewPage, { backgroundColor: theme.surface }]}>
                <Text style={[styles.previewKicker, { color: theme.accent }]}>CHAPTER 01</Text>
                <View style={[styles.previewLineLong, { backgroundColor: theme.text }]} />
                <View style={[styles.previewLine, { backgroundColor: theme.textSecondary }]} />
                <View style={[styles.previewLineShort, { backgroundColor: theme.textSecondary }]} />
              </View>
              <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>外观预览</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 112,
  },
  page: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.4,
    marginBottom: 7,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  intro: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionLabel: {
    marginTop: 38,
    marginBottom: 10,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  settingCard: {
    minHeight: 82,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingCopy: {
    flex: 1,
    marginHorizontal: 13,
  },
  settingTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  preview: {
    marginTop: Spacing.four,
    minHeight: 230,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPage: {
    width: 138,
    height: 162,
    borderRadius: 3,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.11,
    shadowRadius: 10,
    elevation: 3,
  },
  previewKicker: {
    fontFamily: Fonts.serif,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 10,
    marginBottom: 24,
  },
  previewLineLong: {
    width: '76%',
    height: 5,
    borderRadius: 3,
    opacity: 0.82,
  },
  previewLine: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    opacity: 0.3,
    marginTop: 12,
  },
  previewLineShort: {
    width: '64%',
    height: 3,
    borderRadius: 2,
    opacity: 0.3,
    marginTop: 8,
  },
  previewLabel: {
    marginTop: 12,
    fontSize: 11,
    letterSpacing: 0.6,
  },
});
