import {
  Tabs,
  TabList,
  TabSlot,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  type: 'library' | 'settings';
};

export const APP_TAB_BAR_HEIGHT = 58;

export default function AppTabs() {
  return (
    <Tabs style={styles.tabs}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <TabBar>
          <TabTrigger name="library" href="/" asChild>
            <TabButton label="书架" type="library" />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton label="设置" type="settings" />
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}

function TabButton({ isFocused, label, type, ...props }: TabButtonProps) {
  const theme = useTheme();
  const color = isFocused ? theme.navigationActive : theme.textSecondary;
  const iconName =
    type === 'library'
      ? {
          ios: isFocused ? ('books.vertical.fill' as const) : ('books.vertical' as const),
          android: 'menu_book' as const,
          web: 'menu_book' as const,
        }
      : {
          ios: isFocused ? ('gearshape.fill' as const) : ('gearshape' as const),
          android: 'settings' as const,
          web: 'settings' as const,
        };

  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}>
      <SymbolView name={iconName} size={24} tintColor={color} />
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function TabBar({ style, ...props }: TabListProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[
        styles.tabBar,
        {
          height: APP_TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
        },
        style,
      ]}>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flex: 1,
  },
  slot: {
    height: '100%',
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flex: 1,
    height: APP_TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabButtonPressed: {
    opacity: 0.58,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
  },
});
