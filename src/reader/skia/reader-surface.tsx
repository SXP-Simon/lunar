import { Canvas, Picture } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';

import type { ReaderSnapshot } from '../contracts';
import type { LunarReaderRuntime } from '../runtime/native-reader-runtime';

export interface ReaderSurfaceProps {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly style?: StyleProp<ViewStyle>;
}

export function ReaderSurface({ runtime, snapshot, style }: ReaderSurfaceProps) {
  const compiled = runtime.getCurrentPicture();
  const frame = runtime.getCurrentFrame();
  if (!compiled || !frame || snapshot.phase !== 'ready') {
    return null;
  }

  return (
    <Canvas
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={style}>
      <Picture picture={compiled.picture} />
    </Canvas>
  );
}
