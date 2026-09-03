import {
  Tabs,
  TabList,
  TabSlot,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { useTheme } from '@/hooks/use-theme';

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  type: 'library' | 'settings';
};

export const APP_TAB_BAR_HEIGHT = 58;

export default function AppTabs() {
  const tabsStyle = useResolveClassNames('flex-1');
  const tabSlotStyle = useResolveClassNames('h-full');

  return (
    <Tabs style={tabsStyle}>
      <TabSlot style={tabSlotStyle} />
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
  const tabButtonStyle = useResolveClassNames('h-[58px] flex-1 items-center justify-center gap-0.5');
  const pressedTabButtonStyle = useResolveClassNames('opacity-[0.58]');
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
      style={({ pressed }) => [tabButtonStyle, pressed && pressedTabButtonStyle]}>
      <SymbolView name={iconName} size={24} tintColor={color} />
      <Text className={isFocused ? 'text-[10px] font-medium leading-[13px] text-accent' : 'text-[10px] font-medium leading-[13px] text-muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

function TabBar({ style, ...props }: TabListProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      {...props}
      className="absolute inset-x-0 bottom-0 flex-row items-start border-t border-border bg-surface"
      style={[{ height: APP_TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }, style]}>
      {props.children}
    </View>
  );
}
