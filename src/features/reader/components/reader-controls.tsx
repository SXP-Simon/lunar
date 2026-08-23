import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { Slider } from 'heroui-native/slider';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReaderSnapshot } from '@/reader';
import type { LunarReaderRuntime } from '@/reader/native';
import { useTheme } from '@/hooks/use-theme';

interface ReaderControlsProps {
  readonly title: string;
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly onBack: () => void;
  readonly onOpenToc: () => void;
}

export function ReaderControls({
  title,
  runtime,
  snapshot,
  onBack,
  onOpenToc,
}: ReaderControlsProps) {
  const insets = useSafeAreaInsets();
  const total = Math.max(1, snapshot.totalSpreads ?? 1);
  const current = Math.min(total - 1, snapshot.spreadIndex);
  const [draftPage, setDraftPage] = useState<number>();
  const displayedPage = draftPage ?? current;

  return (
    <View className="absolute inset-0 justify-between" pointerEvents="box-none">
      <View
        pointerEvents="box-none"
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}>
        <View className="mx-3 mt-2 flex-row items-center gap-2 rounded-2xl border border-border bg-surface/95 px-2 py-2 shadow-lg">
          <ReaderIconButton
            accessibilityLabel="返回书架"
            name={{ ios: 'chevron.backward', android: 'arrow_back', web: 'arrow_back' }}
            onPress={onBack}
          />
          <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <ReaderIconButton
            accessibilityLabel="打开目录"
            name={{ ios: 'list.bullet', android: 'format_list_bulleted', web: 'list' }}
            onPress={onOpenToc}
          />
        </View>
      </View>

      <View
        pointerEvents="box-none"
        style={{
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}>
        <View className="mx-3 mb-3 gap-3 rounded-3xl border border-border bg-surface/95 px-4 pb-4 pt-3 shadow-xl">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-foreground">阅读进度</Text>
            <Text className="text-sm tabular-nums text-muted">
              {displayedPage + 1} / {total}
            </Text>
          </View>
          <Slider
            accessibilityLabel="选择阅读页面"
            maxValue={total - 1}
            minValue={0}
            onChange={(value) => setDraftPage(toSliderValue(value))}
            onChangeEnd={(value) => {
              const target = toSliderValue(value);
              setDraftPage(undefined);
              void runtime.goToSpread(target);
            }}
            step={1}
            value={displayedPage}>
            <Slider.Track className="h-2">
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <View className="flex-row items-center justify-between gap-2">
            <ReaderIconButton
              accessibilityLabel="后退十页"
              isDisabled={current === 0}
              name={{ ios: 'gobackward.10', android: 'replay_10', web: 'replay_10' }}
              onPress={() => void runtime.goToSpread(current - 10)}
            />
            <Button
              className="h-10 flex-1 rounded-full"
              isDisabled={current === 0}
              onPress={() => void runtime.previous()}
              size="sm"
              variant="secondary">
              上一页
            </Button>
            <Button
              className="h-10 flex-1 rounded-full"
              isDisabled={current >= total - 1}
              onPress={() => void runtime.next()}
              size="sm"
              variant="primary">
              下一页
            </Button>
            <ReaderIconButton
              accessibilityLabel="快进十页"
              isDisabled={current >= total - 1}
              name={{ ios: 'goforward.10', android: 'forward_10', web: 'forward_10' }}
              onPress={() => void runtime.goToSpread(current + 10)}
            />
          </View>
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
}

function ReaderIconButton({
  accessibilityLabel,
  name,
  onPress,
  isDisabled,
}: ReaderIconButtonProps) {
  const theme = useTheme();
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      className="size-10 rounded-full"
      isDisabled={isDisabled}
      isIconOnly
      onPress={onPress}
      size="sm"
      variant="ghost">
      <SymbolView name={name} size={20} tintColor={theme.text} />
    </Button>
  );
}

function toSliderValue(value: number | number[]): number {
  return Math.round(Array.isArray(value) ? (value[0] ?? 0) : value);
}
