import { processTransform3d, type Matrix4 } from '@shopify/react-native-skia';
import { useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

export interface SlidePageTransforms {
  readonly incoming: DerivedValue<Matrix4>;
  readonly outgoing: DerivedValue<Matrix4>;
}

export function useSlidePageTransforms(
  direction: 1 | -1,
  width: number,
  progress: SharedValue<number>,
): SlidePageTransforms {
  const incoming = useDerivedValue(
    () => processTransform3d([{ translateX: direction * width * (1 - progress.value) }]),
    [direction, progress, width],
  );
  const outgoing = useDerivedValue(
    () => processTransform3d([{ translateX: -direction * width * progress.value }]),
    [direction, progress, width],
  );
  return { incoming, outgoing };
}
