import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from 'heroui-native/button';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readingDateKey } from '@/features/reader';
import { useMarkInitialContentReady } from '@/hooks/use-mark-initial-content-ready';
import { useTranslation } from '@/i18n';
import { buildHeatmap, durationParts } from '../domain/statistics';
import { loadStatistics } from '../repositories/statistics-repository';

import { BookReadingRow } from '../components/book-reading-row';
import { DailyReadingSheet } from '../components/daily-reading-sheet';
const levels = [
  'bg-default',
  'bg-navigation-active/20',
  'bg-navigation-active/40',
  'bg-navigation-active/70',
  'bg-navigation-active',
] as const;

export function StatisticsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cellSize = Math.max(
    12,
    Math.min(24, Math.floor((Math.min(width - insets.left - insets.right - 32, 800) - 128) / 13)),
  );
  const { toast } = useToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadStatistics>>>();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [today, setToday] = useState(() =>
    readingDateKey(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
  );
  const notifyError = useEffectEvent(() => toast.show({ variant: 'danger', label: t('statistics.error') }));
  useEffect(() => {
    if (error) notifyError();
  }, [error]);
  useMarkInitialContentReady(Boolean(data) || error);
  useFocusEffect(
    useCallback(() => {
      void revision; // A retry restarts the focused subscription.
      let active = true;
      let request = 0;
      const refresh = async () => {
        const current = ++request;
        setToday(readingDateKey(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));
        try {
          const next = await loadStatistics();
          if (active && current === request) {
            setData(next);
            setError(false);
          }
        } catch {
          if (active && current === request) {
            setError(true);
          }
        }
      };
      void refresh();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      });
      const timer = setInterval(() => void refresh(), 60_000);
      return () => {
        active = false;
        setSelected(undefined);
        subscription.remove();
        clearInterval(timer);
      };
    }, [revision]),
  );
  const weeks = useMemo(() => buildHeatmap(today, data?.daily ?? []), [today, data]);
  const duration = (milliseconds: number) => {
    const parts = durationParts(milliseconds);
    return parts.hours ? t('statistics.hours', parts) : t('statistics.minutes', parts);
  };
  const openBook = (bookId: string) => router.push({ pathname: '/reader/[bookId]', params: { bookId } });
  const closeDay = useCallback(() => setSelected(undefined), []);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' });
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <ScrollView
        contentContainerClassName="grow px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
        <View className="w-full max-w-[800px] self-center gap-5">
          <View className="gap-1">
            <Text accessibilityRole="header" className="text-3xl font-semibold text-foreground">
              {t('statistics.title')}
            </Text>
            <Text className="text-sm text-muted">{t('statistics.subtitle')}</Text>
          </View>
          {error ? (
            <View className="gap-3 rounded-3xl bg-surface p-5">
              <Text className="text-foreground">{t('statistics.error')}</Text>
              <Button variant="secondary" onPress={() => setRevision((value) => value + 1)}>
                {t('statistics.retry')}
              </Button>
            </View>
          ) : null}
          {!data && !error ? <ActivityIndicator accessibilityLabel={t('statistics.loading')} /> : null}
          {data ? (
            <>
              <View className="gap-4 rounded-3xl bg-surface p-5">
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
                    {t('statistics.activity')}
                  </Text>
                  <Text className="text-xs text-muted">{t('statistics.weeks')}</Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="w-8 gap-1 pt-6">
                    {Array.from({ length: 7 }, (_, day) => (
                      <Text
                        key={day}
                        className="text-[10px] text-muted"
                        style={{ height: cellSize, lineHeight: cellSize }}>
                        {new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' }).format(
                          new Date(Date.UTC(2026, 9, 11 + day)),
                        )}
                      </Text>
                    ))}
                  </View>
                  <View className="flex-row gap-1">
                    {weeks.map((week, index) => (
                      <View key={week[0].date} className="gap-1">
                        <Text className="h-5 text-[10px] text-muted">
                          {index === 0 || week.some((day) => day.date.endsWith('-01'))
                            ? dateFormatter.format(
                                new Date(`${(week.find((day) => day.date.endsWith('-01')) ?? week[0]).date}T00:00:00Z`),
                              )
                            : ''}
                        </Text>
                        {week.map((day) => (
                          <PressableFeedback
                            key={day.date}
                            hitSlop={8}
                            isDisabled={day.future}
                            accessibilityRole="button"
                            accessibilityLabel={`${day.date}, ${duration(day.milliseconds)}`}
                            accessibilityState={{ selected: selected === day.date, disabled: day.future }}
                            onPress={() => setSelected(day.date)}
                            onLongPress={() => setSelected(day.date)}
                            style={{ width: cellSize, height: cellSize }}
                            className={`items-center justify-center rounded-md ${day.future ? 'opacity-0' : levels[day.level]} ${selected === day.date ? 'border-2 border-foreground' : ''}`}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
                <View className="flex-row items-center justify-end gap-1.5">
                  <Text className="text-xs text-muted">{t('statistics.less')}</Text>
                  {levels.map((level) => (
                    <View key={level} className={`h-3 w-3 rounded-sm ${level}`} />
                  ))}
                  <Text className="text-xs text-muted">{t('statistics.more')}</Text>
                </View>
                <Text className="text-xs text-muted">{t('statistics.dayHint')}</Text>
              </View>
              <View className="flex-row flex-wrap gap-3">
                {[
                  [t('statistics.books'), t('statistics.count', { count: data.books.length })],
                  [t('statistics.completed'), t('statistics.count', { count: data.completed })],
                  [t('statistics.total'), duration(data.total)],
                  [t('statistics.average'), duration(data.average)],
                ].map(([label, value]) => (
                  <View key={label} className="min-w-[140px] flex-1 basis-[45%] gap-4 rounded-3xl bg-surface p-5">
                    <Text className="text-sm text-muted">{label}</Text>
                    <Text className="text-xl font-semibold text-foreground">{value}</Text>
                  </View>
                ))}
              </View>
              <Text className="text-xs text-muted">{t('statistics.definition')}</Text>
              <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
                {t('statistics.byBook')}
              </Text>
              {data.books.length === 0 ? (
                <View className="gap-3 rounded-3xl bg-surface p-6">
                  <Text className="text-foreground">{t('statistics.empty')}</Text>
                  <Button variant="secondary" onPress={() => router.navigate('/library')}>
                    {t('tabs.library')}
                  </Button>
                </View>
              ) : null}
              {data.books.map((book) => (
                <BookReadingRow key={book.id} book={book} onPress={() => openBook(book.id)} />
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
      <DailyReadingSheet
        date={selected}
        books={selected ? (data?.dayBooks[selected] ?? []) : []}
        onClose={closeDay}
        onOpenBook={openBook}
      />
    </View>
  );
}
