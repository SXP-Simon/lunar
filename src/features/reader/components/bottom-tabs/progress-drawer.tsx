import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { Slider } from 'heroui-native/slider';
import { memo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReaderSnapshot } from '@/reader';
import type { LunarReaderRuntime } from '@/reader/native';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { getReaderBottomTabBarInset } from './constants';

interface ProgressDrawerProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (value: boolean) => void;
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
}

function ProgressDrawerContent({
  isOpen,
  onOpenChange,
  runtime,
  snapshot,
}: ProgressDrawerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomInset = getReaderBottomTabBarInset(insets.bottom);
  const total = snapshot.totalSpreads;
  const currentPage = snapshot.bookSpreadIndex;
  const hasAbsolutePosition = currentPage !== undefined && total !== undefined;
  const sliderValue = currentPage ?? 0;
  const sliderMax = Math.max(0, (total ?? 1) - 1);
  const [draftPage, setDraftPage] = useState<number>();
  const displayedPage = draftPage ?? sliderValue;
  const percentage = total === undefined
    ? undefined
    : Math.round((displayedPage / Math.max(total - 1, 1)) * 100);
  const goToPage = (target: number) => {
    if (!hasAbsolutePosition) return;
    setDraftPage(undefined);
    void runtime.goToSpread(Math.min(Math.max(target, 0), sliderMax));
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal disableFullWindowOverlay unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay style={{ bottom: bottomInset }} />
        <BottomSheet.Content
          backgroundClassName="rounded-t-3xl"
          bottomInset={bottomInset}
          contentContainerClassName="px-0 pb-0!"
          detached
          enableOverDrag={false}>
          <View className="gap-5 px-5 pb-4 pt-2">
            <BottomSheet.Title className="text-center text-sm font-normal text-muted">
              {percentage === undefined
                ? t('reader.calculatingBookPages')
                : t('reader.readingProgress', { percentage })}
            </BottomSheet.Title>

            <Slider
              accessibilityLabel={t('reader.choosePage')}
              isDisabled={!hasAbsolutePosition || total <= 1}
              maxValue={sliderMax}
              minValue={0}
              onChange={(value) => setDraftPage(toSliderValue(value))}
              onChangeEnd={(value) => {
                const target = toSliderValue(value);
                setDraftPage(undefined);
                if (hasAbsolutePosition) void runtime.goToSpread(target);
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
                accessibilityLabel={t('reader.firstPage')}
                isDisabled={!hasAbsolutePosition || currentPage === 0}
                name={{ ios: 'backward.end.fill', android: 'first_page', web: 'first_page' }}
                onPress={() => goToPage(0)}
              />
              <ProgressAction
                accessibilityLabel={t('reader.previousTenPages')}
                isDisabled={!hasAbsolutePosition || currentPage === 0}
                name={{ ios: 'gobackward.10', android: 'replay_10', web: 'replay_10' }}
                onPress={() => goToPage((currentPage ?? 0) - 10)}
              />
              <ProgressAction
                accessibilityLabel={t('reader.nextTenPages')}
                isDisabled={!hasAbsolutePosition || (currentPage ?? 0) >= (total ?? 1) - 1}
                name={{ ios: 'goforward.10', android: 'forward_10', web: 'forward_10' }}
                onPress={() => goToPage((currentPage ?? 0) + 10)}
              />
              <ProgressAction
                accessibilityLabel={t('reader.lastPage')}
                isDisabled={!hasAbsolutePosition || (currentPage ?? 0) >= (total ?? 1) - 1}
                name={{ ios: 'forward.end.fill', android: 'last_page', web: 'last_page' }}
                onPress={() => total !== undefined && goToPage(total - 1)}
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

/** Keep the closing view mounted while settled-page updates stay outside it. */
export const ProgressDrawer = memo(ProgressDrawerContent, (previous, next) =>
  previous.isOpen === next.isOpen
  && previous.runtime === next.runtime
  && previous.onOpenChange === next.onOpenChange
  && (!next.isOpen || previous.snapshot === next.snapshot));
