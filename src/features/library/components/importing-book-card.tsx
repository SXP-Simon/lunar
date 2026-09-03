import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing, useTheme } from '@/hooks/use-theme';

const RING_SIZE = 54;
const RING_STROKE_WIDTH = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type ImportingBookCardProps = {
  title: string;
  progress: number;
  isWaiting: boolean;
};

export function ImportingBookCard({
  title,
  progress,
  isWaiting,
}: ImportingBookCardProps) {
  const theme = useTheme();
  const percentage = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const progressOffset = RING_CIRCUMFERENCE * (1 - percentage / 100);
  const status = isWaiting ? '等待导入' : '导入中';

  return (
    <View
      accessibilityLabel={`${status}《${title}》，${percentage}%`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
      style={styles.card}>
      <View
        style={[
          styles.cover,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
        <View accessible={false} style={styles.progressRing}>
          <Svg height={RING_SIZE} width={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              fill="none"
              r={RING_RADIUS}
              stroke={theme.backgroundElement}
              strokeWidth={RING_STROKE_WIDTH}
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              fill="none"
              r={RING_RADIUS}
              stroke={theme.accent}
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={progressOffset}
              strokeLinecap="round"
              strokeWidth={RING_STROKE_WIDTH}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <Text style={[styles.progressValue, { color: theme.text }]}>{percentage}%</Text>
        </View>
        <Text style={[styles.coverStatus, { color: theme.textSecondary }]}>{status}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.bookName, { color: theme.text }]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={[styles.bookStatus, { color: theme.textSecondary }]}>
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '33.3333%',
    paddingHorizontal: 6,
    marginBottom: Spacing.four,
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
  progressRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressValue: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '600',
  },
  coverStatus: {
    marginTop: Spacing.two,
    fontSize: 11,
  },
  bookName: {
    marginTop: 7,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  bookStatus: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 14,
  },
});
