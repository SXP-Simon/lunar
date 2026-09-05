import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { bookmarkPullDistance, shouldSavePulledBookmark } from '../domain/bookmark-pull';

export function useBookmarkPull({ enabled, onStart, onCommit }: {
  readonly enabled: boolean;
  readonly onStart: () => void;
  readonly onCommit: () => void;
}) {
  const distance = useSharedValue(0);
  /* eslint-disable react-hooks/immutability */
  const gesture = useMemo(() => Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .activeOffsetY(12)
    .failOffsetY(-8)
    .failOffsetX([-12, 12])
    .cancelsTouchesInView(true)
    .onStart(() => {
      'worklet';
      scheduleOnRN(onStart);
    })
    .onUpdate((event) => {
      'worklet';
      distance.value = bookmarkPullDistance(event.translationY);
    })
    .onEnd((event, success) => {
      'worklet';
      if (shouldSavePulledBookmark(event.translationY, success)) scheduleOnRN(onCommit);
    })
    .onFinalize(() => {
      'worklet';
      distance.value = withTiming(0, { duration: 220 });
    }), [distance, enabled, onCommit, onStart]);
  /* eslint-enable react-hooks/immutability */
  const surfaceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: distance.value }] }));
  return { gesture, distance, surfaceStyle };
}
