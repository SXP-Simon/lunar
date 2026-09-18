import { Canvas, Group, Path, Skia, processTransform3d, type SkCanvas } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ReaderRenderFrame } from '../../contracts';
import { readerBookmarkPlacement, readerBookmarkPullHeight, ReaderBookmarkWidth } from './reader-bookmark-geometry';

const BookmarkPath = 'M0 0 H32 V100 L16 88 L0 100 Z';

export function ReaderBookmarkMark({
  frame, pageScale, offsetX, offsetY, topInset, color,
}: {
  readonly frame: ReaderRenderFrame;
  readonly pageScale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly topInset: number;
  readonly color: string;
}) {
  const placement = readerBookmarkPlacement(frame, pageScale, offsetX, offsetY, topInset);
  return (
    <Group transform={[{ translateX: placement.pageX }, { translateY: placement.pageY },
      { scaleX: placement.pageScaleX }, { scaleY: placement.pageScaleY }]}>
      <Path path={BookmarkPath} color={color} />
    </Group>
  );
}

export function ReaderBookmarkPullMark({
  distance, pullBookmarked, baselineHeight, rightEdge, color, outlineColor, style,
}: {
  readonly distance: SharedValue<number>;
  readonly pullBookmarked: SharedValue<boolean>;
  readonly baselineHeight: number;
  readonly rightEdge: number;
  readonly color: string;
  readonly outlineColor: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const matrix = useDerivedValue(() => processTransform3d([
    { translateX: rightEdge - ReaderBookmarkWidth },
    { scaleY: readerBookmarkPullHeight(baselineHeight, distance.value) / 100 },
  ]), [baselineHeight, distance, rightEdge]);
  const filledOpacity = useDerivedValue(() =>
    distance.value > 0 && !pullBookmarked.value && distance.value >= 96 ? 1 : 0,
  [distance, pullBookmarked]);
  const outlineOpacity = useDerivedValue(() =>
    distance.value > 0 && pullBookmarked.value ? 1 : 0,
  [distance, pullBookmarked]);
  return (
    <Canvas pointerEvents="none" style={style}>
      <Group matrix={matrix}>
        <Group opacity={filledOpacity}>
          <Path path={BookmarkPath} color={color} />
        </Group>
        <Group opacity={outlineOpacity}>
          <Path path={BookmarkPath} color={outlineColor} style="stroke" strokeWidth={2} />
        </Group>
      </Group>
    </Canvas>
  );
}

export function renderReaderBookmarkMark(
  canvas: SkCanvas,
  frame: ReaderRenderFrame,
  pageScale: number,
  offsetX: number,
  offsetY: number,
  topInset: number,
  color: string,
) {
  const placement = readerBookmarkPlacement(frame, pageScale, offsetX, offsetY, topInset);
  const path = Skia.Path.MakeFromSVGString(BookmarkPath);
  if (!path) return;
  const paint = Skia.Paint();
  try {
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(color));
    canvas.save();
    try {
      canvas.translate(placement.pageX, placement.pageY);
      canvas.scale(placement.pageScaleX, placement.pageScaleY);
      canvas.drawPath(path, paint);
    } finally {
      canvas.restore();
    }
  } finally {
    paint.dispose();
    path.dispose();
  }
}
