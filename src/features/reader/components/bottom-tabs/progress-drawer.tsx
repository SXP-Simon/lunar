import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { Slider } from 'heroui-native/slider';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReaderSnapshot } from '@/reader';
import type { LunarReaderRuntime } from '@/reader/native';
import { useTheme } from '@/hooks/use-theme';
import { ReaderBottomTabBarContentHeight } from './constants';

interface ProgressDrawerProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (value: boolean) => void;
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
}

export function ProgressDrawer({
  isOpen,
  onOpenChange,
  runtime,
  snapshot,
}: ProgressDrawerProps) {
  const insets = useSafeAreaInsets();
  const total = Math.max(1, snapshot.totalSpreads ?? 1);
  const currentPage = Math.min(total - 1, snapshot.spreadIndex);
  const [draftPage, setDraftPage] = useState<number>();
  const displayedPage = draftPage ?? currentPage;
  const percentage = Math.round((displayedPage / Math.max(total - 1, 1)) * 100);
  const goToPage = (target: number) => {
    setDraftPage(undefined);
    void runtime.goToSpread(Math.min(Math.max(target, 0), total - 1));
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          backgroundClassName="rounded-t-3xl"
          bottomInset={insets.bottom + ReaderBottomTabBarContentHeight}
          contentContainerClassName="h-full px-0"
          detached
          enableDynamicSizing={false}
          enableOverDrag={false}
          snapPoints={['38%']}>
          <View className="gap-6 px-5 pb-8 pt-2">
            <View className="items-center gap-2">
              <BottomSheet.Title className="rounded-full bg-background px-5 py-2 text-2xl tabular-nums text-foreground">
                {displayedPage + 1} / {total}
              </BottomSheet.Title>
              <BottomSheet.Description className="text-sm text-muted">
                阅读进度 {percentage}%
              </BottomSheet.Description>
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
              <Slider.Track className="h-3 rounded-full bg-surface-secondary">
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>

            <View className="flex-row items-center justify-between">
              <ProgressAction
                accessibilityLabel="回到第一页"
                isDisabled={currentPage === 0}
                name={{ ios: 'backward.end.fill', android: 'first_page', web: 'first_page' }}
                onPress={() => goToPage(0)}
              />
              <ProgressAction
                accessibilityLabel="后退十页"
                isDisabled={currentPage === 0}
                name={{ ios: 'gobackward.10', android: 'replay_10', web: 'replay_10' }}
                onPress={() => goToPage(currentPage - 10)}
              />
              <ProgressAction
                accessibilityLabel="前进十页"
                isDisabled={currentPage >= total - 1}
                name={{ ios: 'goforward.10', android: 'forward_10', web: 'forward_10' }}
                onPress={() => goToPage(currentPage + 10)}
              />
              <ProgressAction
                accessibilityLabel="前往最后一页"
                isDisabled={currentPage >= total - 1}
                name={{ ios: 'forward.end.fill', android: 'last_page', web: 'last_page' }}
                onPress={() => goToPage(total - 1)}
              />
            </View>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

interface ProgressActionProps {
  readonly accessibilityLabel: string;
  readonly isDisabled: boolean;
  readonly name: SymbolViewProps['name'];
  readonly onPress: () => void;
}

function ProgressAction({ accessibilityLabel, isDisabled, name, onPress }: ProgressActionProps) {
  const theme = useTheme();
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      className="size-11 rounded-full"
      isDisabled={isDisabled}
      isIconOnly
      onPress={onPress}
      size="sm"
      variant="ghost">
      <SymbolView name={name} size={22} tintColor={theme.text} />
    </Button>
  );
}

function toSliderValue(value: number | number[]): number {
  return Math.round(Array.isArray(value) ? (value[0] ?? 0) : value);
}
