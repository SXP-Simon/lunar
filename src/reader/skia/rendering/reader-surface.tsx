import { Canvas, Picture } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';

import type { ReaderSnapshot } from '../../contracts';
import type { LunarReaderRuntime } from '../../runtime/native-reader-runtime';
import { readerPerformanceMark } from '../../runtime/performance';

export interface ReaderSurfaceProps {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly style?: StyleProp<ViewStyle>;
}

export function ReaderSurface({ runtime, snapshot, style }: ReaderSurfaceProps) {
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

  return (
    <Canvas
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={style}>
      <Picture
        key={`${snapshot.revisionId}:${snapshot.spreadIndex}`}
        picture={compiled.picture}
      />
    </Canvas>
  );
}
