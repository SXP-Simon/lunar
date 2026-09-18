import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { Slider } from 'heroui-native/slider';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type ReaderFontRef,
  type ReaderFontRole,
  type ReaderTypography,
} from '@/reader';
import type { ReaderPageAnimationStyle } from '@/reader/native';
import { useTranslation } from '@/i18n';
import { type ImportedReaderFont, useFontStore, useReaderStore } from '@/stores';
import { FontPickerSheet } from '../font-picker-sheet';
import { getReaderBottomTabBarInset } from './constants';

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomInset = getReaderBottomTabBarInset(insets.bottom);
  const typography = useReaderStore((state) => state.typography);
  const updateTypography = useReaderStore((state) => state.updateTypography);
  const animationStyle = useReaderStore((state) => state.animationStyle);
  const setAnimationStyle = useReaderStore((state) => state.setAnimationStyle);
  const fonts = useFontStore((state) => state.fonts);
  const [draft, setDraft] = useState<ReaderTypography>(typography);
  // The role outlives the open flag so the list does not swap to another role's
  // sources while the sheet is still sliding away.
  const [pickerRole, setPickerRole] = useState<ReaderFontRole>('body');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const bodyFontLabel = describeReaderFont(typography.fonts.body, fonts, t);
  const chromeFontLabel = describeReaderFont(typography.fonts.chrome, fonts, t);
  const animationOptions: readonly {
    readonly style: ReaderPageAnimationStyle;
    readonly label: string;
  }[] = [
    { style: 'cover', label: t('reader.transitionCover') },
    { style: 'page', label: t('reader.transitionPage') },
    { style: 'slide', label: t('reader.transitionSlide') },
  ];

  const updateDraft = (key: TypographyKey, value: number) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const commit = (key: TypographyKey, value: number) => {
    updateTypography({ [key]: value } as Partial<ReaderTypography>);
  };

  // The picker is a sheet of its own, so closing the drawer has to take it down
  // with it rather than leaving it stranded over the book.
  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setIsPickerOpen(false);
    }
    onOpenChange(value);
  };

  const openPicker = (role: ReaderFontRole) => {
    setPickerRole(role);
    setIsPickerOpen(true);
  };

  return (
    <>
      <BottomSheet isOpen={isOpen} onOpenChange={handleOpenChange}>
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
          snapPoints={['58%']}>
          {/* The sheet keeps a fixed height while the rows below it grow with the
              platform's text scale, so the body scrolls rather than clipping. */}
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-5 px-5 pb-5 pt-3"
            showsVerticalScrollIndicator={false}>
            <View className="gap-1">
              <BottomSheet.Title className="text-xl text-foreground">
                {t('reader.typography')}
              </BottomSheet.Title>
            </View>
            <View className="flex-row gap-4">
              <FontRow
                label={t('reader.bodyFont')}
                onPress={() => openPicker('body')}
                value={bodyFontLabel}
              />
              <FontRow
                label={t('reader.uiFont')}
                onPress={() => openPicker('chrome')}
                value={chromeFontLabel}
              />
            </View>
            <View className="gap-2">
              <View className="flex-row gap-2">
                {animationOptions.map((option) => {
                  const selected = animationStyle === option.style;
                  return (
                    <Button
                      key={option.style}
                      accessibilityLabel={t('reader.transition', { style: option.label })}
                      accessibilityState={{ selected }}
                      className="min-w-0 flex-1 rounded-xl px-2"
                      onPress={() => setAnimationStyle(option.style)}
                      size="sm"
                      variant={selected ? 'primary' : 'ghost'}>
                      <Button.Label numberOfLines={1}>{option.label}</Button.Label>
                    </Button>
                  );
                })}
              </View>
            </View>
            <TypographySlider
              accessibilityLabel={t('reader.adjustFontSize')}
              maxValue={32}
              minValue={12}
              onChange={(value) => updateDraft('fontSize', value)}
              onChangeEnd={(value) => commit('fontSize', value)}
              step={1}
              value={draft.fontSize}
            />
            <View className="flex-row gap-4">
              <CompactTypographySlider
                accessibilityLabel={t('reader.adjustMargins')}
                endLabel={t('reader.large')}
                label={t('reader.margin')}
                maxValue={56}
                minValue={8}
                onChange={(value) => updateDraft('marginHorizontal', value)}
                onChangeEnd={(value) => commit('marginHorizontal', value)}
                startLabel={t('reader.small')}
                step={4}
                value={draft.marginHorizontal}
              />
              <CompactTypographySlider
                accessibilityLabel={t('reader.adjustLineHeight')}
                endLabel={t('reader.loose')}
                label={t('reader.lineHeight')}
                maxValue={2.4}
                minValue={1.1}
                onChange={(value) => updateDraft('lineHeight', value)}
                onChangeEnd={(value) => commit('lineHeight', value)}
                startLabel={t('reader.tight')}
                step={0.05}
                value={draft.lineHeight}
              />
            </View>
          </ScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
      <FontPickerSheet
        isOpen={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        role={pickerRole}
      />
    </>
  );
}

/**
 * The stored family for a role, preferring the catalog's name for the file —
 * a persisted name can outlive a rename of the file it points at, and the
 * catalog is what the reader will actually load.
 */
function describeReaderFont(
  ref: ReaderFontRef,
  fonts: readonly ImportedReaderFont[],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (ref.source) {
    case 'system':
      return ref.family;
    case 'imported':
      return fonts.find((font) => font.id === ref.importedFontId)?.family ?? ref.family;
    default:
      return t('reader.builtinFont');
  }
}

interface FontRowProps {
  readonly label: string;
  readonly value: string;
  readonly onPress: () => void;
}

function FontRow({ label, value, onPress }: FontRowProps) {
  return (
    <Button
      accessibilityLabel={label}
      className="h-14 min-w-0 flex-1 flex-row items-center gap-3 rounded-2xl bg-surface-secondary px-4"
      onPress={onPress}
      variant="ghost">
      <Text className="text-sm text-muted">{label}</Text>
      <Button.Label className="min-w-0 flex-1 text-right text-sm" numberOfLines={1}>
        {value}
      </Button.Label>
    </Button>
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
