import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Slider } from 'heroui-native/slider';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReaderTypography } from '@/reader';
import { useReaderStore } from '@/stores';
import { getReaderBottomTabBarInset } from './bottom-tabs/constants';

interface TypographyDrawerProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (value: boolean) => void;
}

type TypographyKey = 'fontSize' | 'marginHorizontal' | 'lineHeight';

interface TypographySliderProps {
  readonly accessibilityLabel: string;
  readonly value: number;
  readonly minValue: number;
  readonly maxValue: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
  readonly onChangeEnd: (value: number) => void;
}

interface CompactTypographySliderProps extends TypographySliderProps {
  readonly endLabel: string;
  readonly label: string;
  readonly startLabel: string;
}

export function TypographyDrawer({ isOpen, onOpenChange }: TypographyDrawerProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = getReaderBottomTabBarInset(insets.bottom);
  const typography = useReaderStore((state) => state.typography);
  const updateTypography = useReaderStore((state) => state.updateTypography);
  const [draft, setDraft] = useState<ReaderTypography>(typography);

  const updateDraft = (key: TypographyKey, value: number) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const commit = (key: TypographyKey, value: number) => {
    updateTypography({ [key]: value } as Partial<ReaderTypography>);
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal
        disableFullWindowOverlay
        unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay style={{ bottom: bottomInset }} />
        <BottomSheet.Content
          backgroundClassName="rounded-t-3xl"
          bottomInset={bottomInset}
          contentContainerClassName="h-full"
          contentContainerProps={{ style: { flex: 1, padding: 0 } }}
          detached
          enableDynamicSizing={false}
          enableOverDrag={false}
          snapPoints={['30%']}>
          <View className="gap-5 px-5 pb-5 pt-3">
            <TypographySlider
              accessibilityLabel="调整字号"
              maxValue={32}
              minValue={12}
              onChange={(value) => updateDraft('fontSize', value)}
              onChangeEnd={(value) => commit('fontSize', value)}
              step={1}
              value={draft.fontSize}
            />
            <View className="flex-row gap-4">
              <CompactTypographySlider
                accessibilityLabel="调整左右边距"
                endLabel="大"
                label="边距"
                maxValue={56}
                minValue={8}
                onChange={(value) => updateDraft('marginHorizontal', value)}
                onChangeEnd={(value) => commit('marginHorizontal', value)}
                startLabel="小"
                step={4}
                value={draft.marginHorizontal}
              />
              <CompactTypographySlider
                accessibilityLabel="调整行距"
                endLabel="松"
                label="行距"
                maxValue={2.4}
                minValue={1.1}
                onChange={(value) => updateDraft('lineHeight', value)}
                onChangeEnd={(value) => commit('lineHeight', value)}
                startLabel="紧"
                step={0.05}
                value={draft.lineHeight}
              />
            </View>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function TypographySlider({
  accessibilityLabel,
  value,
  minValue,
  maxValue,
  step,
  onChange,
  onChangeEnd,
}: TypographySliderProps) {
  return (
    <View className="h-14 flex-row items-center gap-3 rounded-2xl bg-surface-secondary px-4">
      <Text className="text-sm text-muted">A</Text>
      <Slider
        accessibilityLabel={accessibilityLabel}
        className="min-w-0 flex-1"
        maxValue={maxValue}
        minValue={minValue}
        onChange={(next) => onChange(toSliderValue(next))}
        onChangeEnd={(next) => onChangeEnd(toSliderValue(next))}
        step={step}
        value={value}>
        <Slider.Track className="h-2 rounded-full bg-surface-tertiary">
          <Slider.Fill className="rounded-full bg-accent" />
          <Slider.Thumb className="size-11 rounded-full bg-transparent! p-0!">
            <View className="size-11 items-center justify-center rounded-full bg-surface-tertiary">
              <Text className="text-base tabular-nums text-foreground">{formatValue(value)}</Text>
            </View>
          </Slider.Thumb>
        </Slider.Track>
      </Slider>
      <Text className="text-xl text-foreground">A</Text>
    </View>
  );
}

function CompactTypographySlider({
  accessibilityLabel,
  endLabel,
  label,
  value,
  minValue,
  maxValue,
  startLabel,
  step,
  onChange,
  onChangeEnd,
}: CompactTypographySliderProps) {
  return (
    <View className="h-14 min-w-0 flex-1 flex-row items-center gap-2 rounded-full bg-surface-secondary px-3">
      <Text className="text-sm text-muted">{startLabel}</Text>
      <Slider
        accessibilityLabel={accessibilityLabel}
        className="min-w-0 flex-1"
        maxValue={maxValue}
        minValue={minValue}
        onChange={(next) => onChange(toSliderValue(next))}
        onChangeEnd={(next) => onChangeEnd(toSliderValue(next))}
        step={step}
        value={value}>
        <Slider.Track className="h-10 bg-transparent">
          <Slider.Fill className="bg-transparent" />
          <Slider.Thumb className="h-12 w-14 rounded-full bg-transparent! p-0!">
            <View className="h-12 w-14 items-center justify-center rounded-full bg-surface-tertiary">
              <Text className="text-sm font-medium text-foreground">{label}</Text>
            </View>
          </Slider.Thumb>
        </Slider.Track>
      </Slider>
      <Text className="text-sm text-muted">{endLabel}</Text>
    </View>
  );
}

function toSliderValue(value: number | number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : value;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
