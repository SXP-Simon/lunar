import { memo, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset, useSharedValue } from 'react-native-reanimated';
import { useTranslation } from '@/i18n';
import { buildHeatmap, durationParts, type DateRange } from '../domain/statistics';
import { heatmapDimensions } from '../domain/month-labels';
import { HeatmapMonthLabels } from './heatmap-month-labels';

const levels = [
  'bg-default',
  'bg-navigation-active/20',
  'bg-navigation-active/40',
  'bg-navigation-active/70',
  'bg-navigation-active',
] as const;

type HeatmapDay = ReturnType<typeof buildHeatmap>[number][number];

interface HeatmapProps {
  /** The full calendar period; days after `today` stay visible in the calendar layout but cannot be selected. */
  bounds: DateRange;
  today: string;
  daily: readonly { date: string; milliseconds: number }[];
  selected?: string;
  onSelect: (date: string) => void;
}

export function ReadingHeatmap({ bounds, today, daily, selected, onSelect }: HeatmapProps) {
  const { t } = useTranslation();
  const weeks = useMemo(() => buildHeatmap(bounds, today, daily), [bounds, today, daily]);
  const describe = useCallback(
    (day: HeatmapDay) => {
      const parts = durationParts(day.milliseconds);
      return `${day.date}, ${parts.hours ? t('statistics.hours', parts) : t('statistics.minutes', parts)}`;
    },
    [t],
  );
  // Up to six weeks reads best as a calendar; longer periods scroll as week columns.
  const calendar = weeks.length <= 6;
  return (
    <View className="gap-4 rounded-3xl bg-surface p-5">
      <Text className="text-base font-semibold text-foreground">{t('statistics.activity')}</Text>
      {calendar ? (
        <CalendarGrid weeks={weeks} selected={selected} describe={describe} onSelect={onSelect} />
      ) : (
        <WeekColumns
          weeks={weeks.filter((week) => week[0].date <= today)}
          selected={selected}
          describe={describe}
          onSelect={onSelect}
        />
      )}
      <View className="flex-row items-center justify-end gap-1">
        <Text className="text-xs text-muted">{t('statistics.less')}</Text>
        {levels.map((level) => (
          <View key={level} className={`h-2.5 w-2.5 rounded-[2px] ${level}`} />
        ))}
        <Text className="text-xs text-muted">{t('statistics.more')}</Text>
      </View>
    </View>
  );
}

interface GridProps {
  weeks: HeatmapDay[][];
  selected?: string;
  describe: (day: HeatmapDay) => string;
  onSelect: (date: string) => void;
}

function CalendarGrid({ weeks, selected, describe, onSelect }: GridProps) {
  const { t } = useTranslation();
  return (
    <View className="gap-1.5">
      <View className="flex-row gap-1.5">
        {t('statistics.weekdaysShort')
          .split(',')
          .map((day) => (
            <Text key={day} className="min-w-0 flex-1 text-center text-[10px] text-muted">
              {day}
            </Text>
          ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].date} className="flex-row gap-1.5">
          {week.map((day) =>
            day.outside ? (
              <View key={day.date} className="aspect-square min-w-0 flex-1" />
            ) : (
              <HeatmapCell
                key={day.date}
                date={day.date}
                level={day.level}
                future={day.future}
                selected={selected === day.date}
                label={describe(day)}
                onSelect={onSelect}
                className="aspect-square min-w-0 flex-1 items-center justify-center rounded-lg">
                <Text className={`text-xs ${day.level >= 3 && !day.future ? 'text-accent-foreground' : 'text-muted'}`}>
                  {Number(day.date.slice(8))}
                </Text>
              </HeatmapCell>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function WeekColumns({ weeks, selected, describe, onSelect }: GridProps) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const { weekdayWidth, cellSize } = heatmapDimensions(0, fontScale);
  const scroll = useAnimatedRef<ScrollView>();
  const offset = useScrollOffset(scroll);
  const viewportWidth = useSharedValue(0);
  const initialized = useRef(false);
  const months = t('statistics.monthsShort').split(',');
  const cellStyle = useMemo(() => ({ width: cellSize, height: cellSize }), [cellSize]);
  return (
    <View className="flex-row gap-2">
      <View className="gap-0.5" style={{ width: weekdayWidth, paddingTop: Math.ceil(20 * fontScale) + 2 }}>
        {t('statistics.weekdaysShort')
          .split(',')
          .map((day) => (
            <View key={day} className="justify-center" style={{ height: cellSize }}>
              <Text className="text-[10px] text-muted">{day}</Text>
            </View>
          ))}
      </View>
      <Animated.ScrollView
        ref={scroll}
        horizontal
        className="min-w-0 flex-1"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        accessibilityLabel={t('statistics.heatmapScroll')}
        onLayout={({ nativeEvent }) => {
          viewportWidth.value = nativeEvent.layout.width;
          if (!initialized.current) scroll.current?.scrollToEnd({ animated: false });
        }}
        onContentSizeChange={() => {
          if (!initialized.current) scroll.current?.scrollToEnd({ animated: false });
        }}
        onScrollBeginDrag={() => {
          initialized.current = true;
        }}>
        <View className="gap-0.5">
          <HeatmapMonthLabels
            offset={offset}
            viewportWidth={viewportWidth}
            cellSize={cellSize}
            fontScale={fontScale}
            columns={weeks.length}
            starts={weeks.flatMap((week, column) => {
              const first = week.find((day) => day.date.endsWith('-01') && !day.outside && !day.future);
              return first ? [{ date: first.date, column, text: months[Number(first.date.slice(5, 7)) - 1] }] : [];
            })}
          />
          <View className="flex-row gap-0.5">
            {weeks.map((week) => (
              <View key={week[0].date} className="gap-0.5">
                {week.map((day) =>
                  day.outside || day.future ? (
                    <View key={day.date} style={cellStyle} />
                  ) : (
                    <HeatmapCell
                      key={day.date}
                      date={day.date}
                      level={day.level}
                      future={false}
                      selected={selected === day.date}
                      label={describe(day)}
                      onSelect={onSelect}
                      style={cellStyle}
                      className="rounded-[3px]"
                    />
                  ),
                )}
              </View>
            ))}
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

/** A plain Pressable keeps hundreds of cells free of per-cell animation state. */
const HeatmapCell = memo(function HeatmapCell({
  date,
  level,
  future,
  selected,
  label,
  onSelect,
  className,
  style,
  children,
}: {
  date: string;
  level: number;
  future: boolean;
  selected: boolean;
  label: string;
  onSelect: (date: string) => void;
  className: string;
  style?: { width: number; height: number };
  children?: ReactNode;
}) {
  return (
    <Pressable
      disabled={future}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: future }}
      onPress={() => onSelect(date)}
      onLongPress={() => onSelect(date)}
      style={style}
      className={`${className} active:opacity-60 ${future ? 'bg-default opacity-40' : levels[level]} ${selected ? 'border-2 border-navigation-active' : ''}`}>
      {children}
    </Pressable>
  );
});
