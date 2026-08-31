import {
  LinearGradient,
  Rect,
  processTransform3d,
  vec,
  type Matrix4,
} from '@shopify/react-native-skia';
import { useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

export const SLIDE_PAGE_EDGE_SHADOW_WIDTH = 28;

export interface SlidePageTransforms {
  readonly incoming: DerivedValue<Matrix4>;
  readonly outgoing: DerivedValue<Matrix4>;
}

export interface SlidePageEdgeShadowProps {
  readonly direction: 1 | -1;
  readonly width: number;
  readonly height: number;
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

export function SlidePageEdgeShadow({
  direction,
  width,
  height,
}: SlidePageEdgeShadowProps) {
  const x = direction > 0 ? width : -SLIDE_PAGE_EDGE_SHADOW_WIDTH;
  const colors = direction > 0
    ? ['rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0)']
    : ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.3)'];
  return (
    <Rect x={x} y={0} width={SLIDE_PAGE_EDGE_SHADOW_WIDTH} height={height}>
      <LinearGradient
        start={vec(x, 0)}
        end={vec(x + SLIDE_PAGE_EDGE_SHADOW_WIDTH, 0)}
        colors={colors}
      />
    </Rect>
  );
}
