import { Canvas, Group, Picture, Rect as SkiaRect, useCanvasSize } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';
import { useEffect } from 'react';

import type { ReaderSnapshot } from '../../contracts';
import type { LunarReaderRuntime } from '../../runtime/native-reader-runtime';
import { readerPerformanceMark } from '../../runtime/performance';
import type { ReaderOverlayRect } from './overlay-renderer';
import { createReaderSurfaceTransform, type ReaderSurfaceTransform } from './surface-transform';

export type { ReaderSurfaceTransform } from './surface-transform';

export interface ReaderSurfaceProps {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly style?: StyleProp<ViewStyle>;
  readonly overlays?: readonly ReaderOverlayRect[];
  readonly onTransformChange?: (transform: ReaderSurfaceTransform) => void;
}

export function ReaderSurface({ runtime, snapshot, style, overlays = [], onTransformChange }: ReaderSurfaceProps) {
  const { ref, size: viewport } = useCanvasSize();
  const compiled = snapshot.phase === 'ready'
    ? runtime.getCurrentPicture(snapshot.revisionId, snapshot.spreadIndex)
    : undefined;
  const frame = snapshot.phase === 'ready'
    ? runtime.getCurrentFrame(snapshot.spreadIndex)
    : undefined;
  const scale = frame && viewport.width > 0 && viewport.height > 0
    ? Math.min(viewport.width / frame.width, viewport.height / frame.height)
    : 1;
  const offsetX = frame ? (viewport.width - frame.width * scale) / 2 : 0;
  const offsetY = frame ? (viewport.height - frame.height * scale) / 2 : 0;
  useEffect(() => {
    onTransformChange?.(createReaderSurfaceTransform(scale, offsetX, offsetY));
  }, [offsetX, offsetY, onTransformChange, scale]);

  const canRenderFrame = compiled !== undefined && frame !== undefined && snapshot.phase === 'ready';
  if (canRenderFrame) {
    readerPerformanceMark('reader.canvas.render', `spread=${snapshot.spreadIndex}`);
  }

  return (
    <Canvas
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      ref={ref}
      style={style}>
      {canRenderFrame && (
        <Group transform={[{ translateX: offsetX }, { translateY: offsetY }, { scale }]}>
          <Picture key={`${snapshot.revisionId}:${snapshot.spreadIndex}`} picture={compiled.picture} />
          {overlays.filter((overlay) => overlay.revisionId === undefined || overlay.revisionId === snapshot.revisionId).map((overlay, index) => (
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
      )}
    </Canvas>
  );
}
