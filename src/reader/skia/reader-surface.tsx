import { Canvas, Picture } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { ReaderSnapshot } from '../contracts';
import type { LunarReaderRuntime } from '../runtime/native-reader-runtime';

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
  console.info('[LunarReaderDiagnostic] Reader surface rendered.', {
    revisionId: snapshot.revisionId,
    spreadIndex: snapshot.spreadIndex,
    phase: snapshot.phase,
    hasPicture: Boolean(compiled),
    hasFrame: Boolean(frame),
  });

  useEffect(() => {
    if (!compiled || !frame || snapshot.phase !== 'ready') {
      return;
    }
    console.info('[LunarReaderDiagnostic] Reader surface received picture.', {
      revisionId: snapshot.revisionId,
      spreadIndex: snapshot.spreadIndex,
      frameSize: { width: frame.width, height: frame.height },
      pictureSize: { width: compiled.width, height: compiled.height },
    });
  }, [compiled, frame, snapshot.phase, snapshot.revisionId, snapshot.spreadIndex]);

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
      <Picture
        key={`${snapshot.revisionId}:${snapshot.spreadIndex}`}
        picture={compiled.picture}
      />
    </Canvas>
  );
}
