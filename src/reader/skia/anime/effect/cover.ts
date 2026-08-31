import { processTransform3d, type Matrix4 } from '@shopify/react-native-skia';
import { useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

export function useCoverPageTransform(
  direction: 1 | -1,
  width: number,
  progress: SharedValue<number>,
): DerivedValue<Matrix4> {
  return useDerivedValue(() => {
    const originX = direction > 0 ? width : 0;
    const scaleX = Math.max(0.001, progress.value);
    return processTransform3d([
      { translateX: originX },
      { scaleX },
      { translateX: -originX },
    ]);
  }, [direction, progress, width]);
}
