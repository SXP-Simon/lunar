import { useState } from 'react';
import { Text, View } from 'react-native';
import { layoutMonthLabels } from '../domain/month-labels';

export function HeatmapMonthLabels({
  starts,
  cellSize,
  fontScale,
}: {
  starts: { date: string; column: number; text: string }[];
  cellSize: number;
  fontScale: number;
}) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const gridWidth = cellSize * 13 + 4 * 12;
  const keyFor = (text: string) => `${fontScale}:${text}`;
  const labels = layoutMonthLabels(
    starts.map((start) => ({ ...start, width: widths[keyFor(start.text)] ?? 0 })),
    cellSize + 4,
    gridWidth,
  );
  return (
    <View className="relative" style={{ width: gridWidth, height: Math.ceil(20 * fontScale) }}>
      {starts.map(({ date, text }) => (
        <Text
          key={`${date}:${fontScale}:${text}`}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute left-0 top-0 text-[10px] text-muted opacity-0"
          onLayout={({ nativeEvent }) => {
            const width = nativeEvent.layout.width;
            const key = keyFor(text);
            setWidths((previous) => (previous[key] === width ? previous : { ...previous, [key]: width }));
          }}>
          {text}
        </Text>
      ))}
      {labels.map(({ date, left, width }) => (
        <Text key={date} className="absolute top-0 text-[10px] text-muted" style={{ left, width }}>
          {starts.find((start) => start.date === date)!.text}
        </Text>
      ))}
    </View>
  );
}
