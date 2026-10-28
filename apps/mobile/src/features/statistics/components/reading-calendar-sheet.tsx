import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Tabs } from 'heroui-native/tabs';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/i18n';
import { durationParts, monthCalendars } from '../domain/statistics';

const calendarSnapPoints = ['85%'];
const levels = [
  'bg-default',
  'bg-navigation-active/20',
  'bg-navigation-active/40',
  'bg-navigation-active/70',
  'bg-navigation-active',
] as const;

export type CalendarMode = 'month' | 'year';
type MonthCalendar = ReturnType<typeof monthCalendars>[number];
type YearCalendar = { year: string; months: MonthCalendar[]; readingDays: number };

/**
 * Scrolls through every month (or year) from the year of the first reading record to today,
 * opening on the one that contains `focus`.
 */
export function ReadingCalendarSheet({
  focus,
  initialMode,
  today,
  daily,
  isOpen,
  onClose,
  onOpenDay,
}: {
  focus: string;
  initialMode: CalendarMode;
  today: string;
  daily: readonly { date: string; milliseconds: number }[];
  isOpen: boolean;
  onClose: () => void;
  onOpenDay: (date: string) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState(initialMode);
  const [target, setTarget] = useState(focus);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [openings, setOpenings] = useState(0);
  const list = useRef<ComponentRef<typeof BottomSheetFlatList>>(null);
  const scrolled = useRef(false);
  // Each opening starts from the period shown on the page, retaining the closing animation's content.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setMode(initialMode);
      setTarget(focus);
      setOpenings((value) => value + 1);
    }
  }
  useEffect(() => {
    scrolled.current = false;
  }, [mode, openings, target]);
  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, onClose]);
  // `daily` is sorted newest first, so its last entry is the first reading record.
  const first = daily.at(-1)?.date ?? today;
  const months = useMemo(
    () => (mode === 'month' ? monthCalendars({ start: `${first.slice(0, 4)}-01-01`, end: today }, today, daily) : []),
    [daily, first, mode, today],
  );
  const years = useMemo<YearCalendar[]>(() => {
    if (mode !== 'year') return [];
    return Array.from({ length: Number(today.slice(0, 4)) - Number(first.slice(0, 4)) + 1 }, (_, index) => {
      const year = String(Number(first.slice(0, 4)) + index);
      const calendars = monthCalendars({ start: `${year}-01-01`, end: `${year}-12-31` }, today, daily);
      return { year, months: calendars, readingDays: calendars.reduce((sum, month) => sum + month.readingDays, 0) };
    });
  }, [daily, first, mode, today]);
  const targetIndex =
    mode === 'month'
      ? months.findIndex((month) => month.month.slice(0, 7) === target.slice(0, 7))
      : years.findIndex((year) => year.year === target.slice(0, 4));
  const scrollToTarget = () => {
    if (scrolled.current || targetIndex <= 0) return;
    scrolled.current = true;
    list.current?.scrollToIndex({ index: targetIndex, animated: false });
  };
  const switchMode = (next: CalendarMode, date: string) => {
    setTarget(date);
    setMode(next);
  };
  const duration = (milliseconds: number) => {
    const parts = durationParts(milliseconds);
    return parts.hours ? t('statistics.hours', parts) : t('statistics.minutes', parts);
  };
  const monthName = (month: string) => t('statistics.monthsLong').split(',')[Number(month.slice(5, 7)) - 1];
  const monthTitle = (month: string) =>
    month.slice(0, 4) === today.slice(0, 4)
      ? monthName(month)
      : t('statistics.monthTitle', { year: Number(month.slice(0, 4)), month: monthName(month) });
  const listProps = {
    ref: list,
    style: { flex: 1 },
    showsVerticalScrollIndicator: false,
    contentContainerStyle: { paddingBottom: insets.bottom + 24, gap: 32 },
    onLayout: scrollToTarget,
    onScrollToIndexFailed: ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      // Unmeasured rows: jump near the estimate first, then settle on the exact row once it renders.
      list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
      setTimeout(() => list.current?.scrollToIndex({ index, animated: false }), 50);
    },
  };
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          backgroundClassName="rounded-t-3xl bg-background dark:bg-surface"
          contentContainerClassName="h-full px-5"
          snapPoints={calendarSnapPoints}
          enableDynamicSizing={false}
          enableOverDrag={false}>
          <View className="gap-3 pb-3">
            <View className="flex-row items-center justify-between gap-3">
              <BottomSheet.Title className="min-w-0 flex-1 text-xl font-semibold text-foreground">
                {t('statistics.activity')}
              </BottomSheet.Title>
              <Tabs value={mode} onValueChange={(value) => switchMode(value as CalendarMode, focus)} variant="primary">
                <Tabs.List>
                  <Tabs.Indicator />
                  {(['month', 'year'] as const).map((item) => (
                    <Tabs.Trigger key={item} value={item}>
                      <Tabs.Label>{t(`statistics.dimension.${item}`)}</Tabs.Label>
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
              </Tabs>
            </View>
            {mode === 'month' ? (
              <View className="flex-row gap-2">
                {t('statistics.weekdaysShort')
                  .split(',')
                  .map((day) => (
                    <Text key={day} className="min-w-0 flex-1 text-center text-[10px] text-muted">
                      {day}
                    </Text>
                  ))}
              </View>
            ) : null}
          </View>
          {/* Keys remount each list so its first layout scrolls to the target month or year. */}
          {mode === 'month' ? (
            <BottomSheetFlatList<MonthCalendar>
              key={`month:${openings}:${target}`}
              {...listProps}
              data={months}
              keyExtractor={(month: MonthCalendar) => month.month}
              renderItem={({ item: month }: { item: MonthCalendar }) => (
                <View className="gap-3">
                  <Text className="text-base font-semibold text-foreground">
                    {monthTitle(month.month)} · {t('statistics.daysCount', { count: month.readingDays })}
                  </Text>
                  {month.weeks.map((week) => (
                    <View key={week[0].date} className="flex-row gap-2">
                      {week.map((day) =>
                        day.outside ? (
                          <View key={day.date} className="min-w-0 flex-1" />
                        ) : (
                          <Pressable
                            key={day.date}
                            disabled={day.future}
                            accessibilityRole="button"
                            accessibilityLabel={`${day.date}, ${duration(day.milliseconds)}`}
                            accessibilityState={{ disabled: day.future }}
                            className="min-w-0 flex-1 items-center gap-1 active:opacity-60"
                            onPress={() => onOpenDay(day.date)}>
                            <Text className="text-[10px] text-muted">{Number(day.date.slice(8))}</Text>
                            <View
                              className={`aspect-square w-full rounded-lg ${day.future ? 'bg-default opacity-40' : levels[day.level]}`}
                            />
                          </Pressable>
                        ),
                      )}
                    </View>
                  ))}
                </View>
              )}
            />
          ) : (
            <BottomSheetFlatList<YearCalendar>
              key={`year:${openings}:${target}`}
              {...listProps}
              data={years}
              keyExtractor={(year: YearCalendar) => year.year}
              renderItem={({ item: year }: { item: YearCalendar }) => (
                <View className="gap-3">
                  <Text className="text-base font-semibold text-foreground">
                    {t('statistics.yearTitle', { year: Number(year.year) })} ·{' '}
                    {t('statistics.daysCount', { count: year.readingDays })}
                  </Text>
                  <View className="-mx-1.5 flex-row flex-wrap gap-y-5">
                    {year.months.map((month) => {
                      const future = month.month > today;
                      return (
                        <Pressable
                          key={month.month}
                          disabled={future}
                          accessibilityRole="button"
                          accessibilityLabel={`${monthTitle(month.month)}, ${t('statistics.daysCount', { count: month.readingDays })}`}
                          accessibilityState={{ disabled: future }}
                          className="w-1/3 gap-2 px-1.5 active:opacity-60"
                          onPress={() => switchMode('month', month.month)}>
                          <Text
                            className={`text-sm font-semibold ${
                              month.month.slice(0, 7) === today.slice(0, 7)
                                ? 'text-navigation-active'
                                : future
                                  ? 'text-muted'
                                  : 'text-foreground'
                            }`}>
                            {monthName(month.month)}
                          </Text>
                          <View className="gap-[3px]">
                            {month.weeks.map((week) => (
                              <View key={week[0].date} className="flex-row gap-[3px]">
                                {week.map((day) => (
                                  <View
                                    key={day.date}
                                    className={`aspect-square min-w-0 flex-1 rounded-[2px] ${day.outside ? '' : day.future ? 'bg-default opacity-40' : levels[day.level]}`}
                                  />
                                ))}
                              </View>
                            ))}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            />
          )}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
