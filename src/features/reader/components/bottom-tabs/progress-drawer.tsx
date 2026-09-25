import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { Slider } from 'heroui-native/slider';
import { memo, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReaderSnapshot } from '@/reader';
import type { LunarReaderRuntime } from '@/reader/native';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/i18n';
import { readingDateKey, summarizeReadingTime, type ReadingSession } from '../../domain/reading-time';
import { listReadingSessions } from '../../services/reading-time-service';
import { getReaderBottomTabBarInset } from './constants';

interface ProgressDrawerProps {
  readonly bookId: string;
  readonly isOpen: boolean;
  readonly onOpenChange: (value: boolean) => void;
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
}

function ProgressDrawerContent({
  bookId,
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
  const [readingSessions, setReadingSessions] = useState<readonly ReadingSession[]>([]);
  const [readingTimeError, setReadingTimeError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen || !bookId) return;
    let active = true;
    const refresh = () => {
      void listReadingSessions(bookId).then((sessions) => {
        if (active) {
          setReadingSessions(sessions);
          setReadingTimeError(false);
          setNow(Date.now());
        }
      }).catch(() => { if (active) setReadingTimeError(true); });
    };
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [bookId, isOpen]);
  const dailyReading = useMemo(() => summarizeReadingTime(readingSessions), [readingSessions]);
  const today = readingDateKey(now, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const todayMilliseconds = dailyReading.find((day) => day.date === today)?.milliseconds ?? 0;
  const totalMilliseconds = dailyReading.reduce((sum, day) => sum + day.milliseconds, 0);
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
          backgroundClassName="rounded-t-3xl bg-background dark:bg-overlay"
          bottomInset={bottomInset}
          contentContainerClassName="px-0 pb-0!"
          detached
          enableOverDrag={false}>
          <View className="gap-5 px-5 pb-4 pt-5">
            <View className="flex-row items-center">
              <View className="min-w-0 flex-1 items-center gap-1">
                <Text className="text-2xl font-semibold text-foreground" numberOfLines={1} adjustsFontSizeToFit>
                  {percentage === undefined ? '—' : `${percentage}%`}
                </Text>
                <BottomSheet.Title className="text-center text-xs font-normal text-muted">
                  {t('reader.readingProgressLabel')}
                </BottomSheet.Title>
              </View>
              <View className="h-10 w-px bg-border" />
              <View className="min-w-0 flex-1 items-center gap-1">
                <Text className="text-2xl font-semibold text-foreground" numberOfLines={1} adjustsFontSizeToFit>
                  {readingTimeError ? '—' : formatDuration(todayMilliseconds, t)}
                </Text>
                <Text className="text-center text-xs text-muted">{t('reader.todayReadingTime')}</Text>
              </View>
              <View className="h-10 w-px bg-border" />
              <View className="min-w-0 flex-1 items-center gap-1">
                <Text className="text-2xl font-semibold text-foreground" numberOfLines={1} adjustsFontSizeToFit>
                  {readingTimeError ? '—' : formatDuration(totalMilliseconds, t)}
                </Text>
                <Text className="text-center text-xs text-muted">{t('reader.totalReadingTime')}</Text>
              </View>
            </View>

            <View className="rounded-full bg-surface px-4 py-3 dark:bg-surface-secondary">
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
                <Slider.Track className="h-2 rounded-full bg-surface-tertiary">
                  <Slider.Fill />
                  <Slider.Thumb className="border border-border bg-surface dark:border-0 dark:bg-accent" />
                </Slider.Track>
              </Slider>
            </View>

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
            {readingTimeError && (
              <Text className="text-center text-xs text-muted">{t('reader.readingTimeLoadFailed')}</Text>
            )}
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
      className="size-11 rounded-full bg-surface dark:bg-transparent"
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

function formatDuration(milliseconds: number, t: ReturnType<typeof useTranslation>['t']): string {
  if (milliseconds > 0 && milliseconds < 60_000) return t('reader.lessThanMinute');
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return t('reader.readingMinutes', { minutes });
  if (minutes % 60 === 0) return t('reader.readingHours', { hours: Math.floor(minutes / 60) });
  return t('reader.readingDuration', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** Keep the closing view mounted while settled-page updates stay outside it. */
export const ProgressDrawer = memo(ProgressDrawerContent, (previous, next) =>
  previous.bookId === next.bookId
  && previous.isOpen === next.isOpen
  && previous.runtime === next.runtime
  && previous.onOpenChange === next.onOpenChange
  && (!next.isOpen || previous.snapshot === next.snapshot));
