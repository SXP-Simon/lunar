import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

export const IconTabBarContentHeight = 52;
export const IconTabBarTopPadding = 12;
export const IconTabBarBottomPadding = 12;
export const IconTabBarHeight =
  IconTabBarTopPadding + IconTabBarContentHeight + IconTabBarBottomPadding;

export interface IconTabBarItem {
  readonly key: string;
  readonly accessibilityLabel: string;
  readonly name: SymbolViewProps['name'];
}

interface IconTabBarProps {
  readonly items: readonly IconTabBarItem[];
  readonly activeKey?: string;
  readonly onSelect: (key: string) => void;
}

export function IconTabBar({ items, activeKey, onSelect }: IconTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View
      className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface/95 px-3"
      pointerEvents="box-none"
      style={{
        paddingTop: IconTabBarTopPadding,
        paddingBottom: insets.bottom + IconTabBarBottomPadding,
      }}>
      <View className="w-full flex-row items-center" style={{ height: IconTabBarContentHeight }}>
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <Button
              key={item.key}
              accessibilityLabel={item.accessibilityLabel}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={isActive
                ? 'h-12 flex-1 rounded-xl bg-surface-secondary'
                : 'h-12 flex-1 rounded-xl'}
              isIconOnly
              onPress={() => onSelect(item.key)}
              size="sm"
              variant="ghost">
              <SymbolView name={item.name} size={27} tintColor={isActive ? theme.accent : theme.textSecondary} />
            </Button>
          );
        })}
      </View>
    </View>
  );
}
