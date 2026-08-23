import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { ReaderBottomTabBarContentHeight } from './bottom-tabs/constants';

const ControlHorizontalPadding = 12;

interface ReaderControlsProps {
  readonly title: string;
  readonly onBack: () => void;
  readonly onOpenToc: () => void;
  readonly onOpenProgress: () => void;
}

export function ReaderControls({
  title,
  onBack,
  onOpenToc,
  onOpenProgress,
}: ReaderControlsProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute inset-0 justify-between overflow-hidden" pointerEvents="box-none">
      <View
        className="w-full self-stretch overflow-hidden border-b border-border bg-surface/95 pb-2"
        style={{
          paddingTop: insets.top,
          paddingLeft: Math.max(insets.left, ControlHorizontalPadding),
          paddingRight: Math.max(insets.right, ControlHorizontalPadding),
        }}>
        <View className="h-12 w-full flex-row items-center gap-2">
          <ReaderIconButton
            accessibilityLabel="返回书架"
            name={{ ios: 'chevron.backward', android: 'arrow_back', web: 'arrow_back' }}
            onPress={onBack}
          />
          <Text
            className="min-w-0 flex-1 text-center text-base font-semibold text-foreground"
            numberOfLines={1}>
            {title}
          </Text>
          <View className="size-10" />
        </View>
      </View>

      <View
        className="w-full self-stretch overflow-hidden border-t border-border bg-surface/95 pt-3"
        style={{
          paddingBottom: insets.bottom,
          paddingLeft: Math.max(insets.left, ControlHorizontalPadding),
          paddingRight: Math.max(insets.right, ControlHorizontalPadding),
        }}>
        <View
          className="w-full flex-row items-center pb-3"
          style={{ height: ReaderBottomTabBarContentHeight }}>
          <ReaderIconButton
            accessibilityLabel="打开目录"
            isTab
            name={{ ios: 'list.bullet', android: 'format_list_bulleted', web: 'list' }}
            onPress={onOpenToc}
          />
          <ReaderIconButton
            accessibilityLabel="打开阅读进度"
            isTab
            onPress={onOpenProgress}
            name={{ ios: 'chart.bar', android: 'timeline', web: 'timeline' }}
          />
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
  readonly isTab?: boolean;
}

function ReaderIconButton({
  accessibilityLabel,
  name,
  onPress,
  isDisabled,
  isTab,
}: ReaderIconButtonProps) {
  const theme = useTheme();
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      className={isTab ? 'h-12 flex-1 aspect-auto rounded-none' : 'size-10 rounded-full'}
      isDisabled={isDisabled}
      isIconOnly
      onPress={onPress}
      size="sm"
      variant="ghost">
      <SymbolView name={name} size={isTab ? 27 : 20} tintColor={theme.text} />
    </Button>
  );
}
