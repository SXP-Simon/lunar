import { Canvas, Group, Picture, Rect as SkiaRect } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';
import { useState } from 'react';

import type { ReaderSnapshot } from '../../contracts';
import type { LunarReaderRuntime } from '../../runtime/native-reader-runtime';
import { readerPerformanceMark } from '../../runtime/performance';
import type { ReaderOverlayRect } from './overlay-renderer';

export interface ReaderSurfaceProps {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly style?: StyleProp<ViewStyle>;
  readonly overlays?: readonly ReaderOverlayRect[];
}

export function ReaderSurface({ runtime, snapshot, style, overlays = [] }: ReaderSurfaceProps) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const compiled = snapshot.phase === 'ready'
    ? runtime.getCurrentPicture(snapshot.revisionId, snapshot.spreadIndex)
    : undefined;
  const frame = snapshot.phase === 'ready'
    ? runtime.getCurrentFrame(snapshot.spreadIndex)
    : undefined;

  if (!compiled || !frame || snapshot.phase !== 'ready') {
    return null;
  }

  readerPerformanceMark('reader.canvas.render', `spread=${snapshot.spreadIndex}`);
  const scale = viewport.width > 0 && viewport.height > 0
    ? Math.min(viewport.width / frame.width, viewport.height / frame.height)
    : 1;
  const offsetX = (viewport.width - frame.width * scale) / 2;
  const offsetY = (viewport.height - frame.height * scale) / 2;

  return (
    <Canvas
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setViewport((current) => current.width === width && current.height === height ? current : { width, height });
      }}
      style={style}>
      <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale }]}>
        <Picture key={`${snapshot.revisionId}:${snapshot.spreadIndex}`} picture={compiled.picture} />
        {overlays.map((overlay, index) => (
          <SkiaRect
            key={`${index}:${overlay.bounds.x}:${overlay.bounds.y}`}
            x={overlay.bounds.x}
            y={overlay.bounds.y}
            width={overlay.bounds.width}
            height={overlay.bounds.height}
            color={overlay.color}
            style={overlay.outline ? 'stroke' : 'fill'}
            strokeWidth={overlay.thickness ?? 1}
          />
        ))}
      </Group>
    </Canvas>
  );
}
