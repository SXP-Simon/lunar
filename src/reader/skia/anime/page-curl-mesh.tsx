import { Group, Picture, Rect, Skia, processTransform3d, type Matrix4 } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { CompiledReaderPicture } from '../rendering/picture-compiler';

const CURL_COLUMNS = 32;

interface PageCurlMeshProps {
  readonly picture: CompiledReaderPicture;
  readonly width: number;
  readonly height: number;
  readonly direction: 1 | -1;
  readonly progress: SharedValue<number>;
  readonly grabX: number;
  readonly grabY: number;
}

/**
 * Draws a Picture as narrow, independently transformed strips. The strips
 * approximate a cylindrical page surface while keeping the original SkPicture
 * available, so no extra raster snapshot is required for the interactive turn.
 */
export function PageCurlMesh({
  picture,
  width,
  height,
  direction,
  progress,
  grabX,
  grabY,
}: PageCurlMeshProps) {
  const stripWidth = width / CURL_COLUMNS;
  return (
    <Group>
      {Array.from({ length: CURL_COLUMNS }, (_, index) => (
        <CurlStrip
          key={index}
          direction={direction}
          grabX={grabX}
          grabY={grabY}
          height={height}
          index={index}
          picture={picture}
          progress={progress}
          stripWidth={stripWidth}
          width={width}
        />
      ))}
    </Group>
  );
}

interface CurlStripProps {
  readonly picture: CompiledReaderPicture;
  readonly progress: SharedValue<number>;
  readonly width: number;
  readonly height: number;
  readonly stripWidth: number;
  readonly index: number;
  readonly direction: 1 | -1;
  readonly grabX: number;
  readonly grabY: number;
}

function CurlStrip({
  picture,
  progress,
  width,
  height,
  stripWidth,
  index,
  direction,
  grabX,
  grabY,
}: CurlStripProps) {
  const x = index * stripWidth;
  const clip = useMemo(() => Skia.XYWHRect(x, 0, stripWidth + 0.75, height), [height, stripWidth, x]);
  const matrix = useDerivedValue<Matrix4>(() => {
    const center = x + stripWidth / 2;
    const distance = direction > 0 ? center - grabX : grabX - center;
    const normalized = Math.min(1, Math.max(0, distance / Math.max(1, width)));
    const turn = Math.min(1, Math.max(0, progress.value));
    const bend = normalized * turn;
    const angle = direction * (Math.PI * 0.88) * bend;
    const depth = (1 - Math.cos(angle)) * stripWidth * 1.8;
    const axisTilt = (grabY / Math.max(1, height) - 0.5) * 0.55 * turn;
    const pivotX = grabX;
    const pivotY = grabY;
    return processTransform3d([
      { translateX: pivotX },
      { translateY: pivotY },
      { perspective: Math.max(width, height) * 2.4 },
      { rotateZ: axisTilt },
      { rotateY: angle },
      { translateZ: direction * depth },
      { translateX: -pivotX },
      { translateY: -pivotY },
    ]);
  }, [direction, grabX, grabY, height, progress, width, x, stripWidth]);
  const shade = useDerivedValue(() => {
    const center = x + stripWidth / 2;
    const distance = direction > 0 ? center - grabX : grabX - center;
    const normalized = Math.min(1, Math.max(0, distance / Math.max(1, width)));
    const angle = normalized * Math.PI * 0.88 * Math.min(1, Math.max(0, progress.value));
    return Math.min(0.42, Math.abs(Math.sin(angle)) * 0.34);
  }, [direction, grabX, progress, stripWidth, width, x]);

  return (
    <Group clip={clip} matrix={matrix}>
      <Picture picture={picture.picture} />
      <Rect x={x} y={0} width={stripWidth + 0.75} height={height} color="#000000" opacity={shade} />
    </Group>
  );
}
