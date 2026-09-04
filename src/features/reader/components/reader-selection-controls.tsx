import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { Fragment, useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useCSSVariable } from 'uniwind';
import type { EdgeInsets } from 'react-native-safe-area-context';

import type { ReaderRect } from '@/reader';
import {
  computeReaderSelectionControlsLayout,
  ReaderSelectionToolbarWidth,
} from './reader-selection-layout';

const HandleTouchSize = 48;
const HandleVisualOffsetY = 8;
const HandleKnobCenterOffsetY = 14;

interface ReaderSelectionControlsProps {
  readonly copyLabel: string;
  readonly highlightLabel: string;
  readonly selectionLabel: string;
  readonly startHandleLabel: string;
  readonly endHandleLabel: string;
  readonly isHighlightDisabled?: boolean;
  readonly rects: readonly ReaderRect[];
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly safeAreaInsets: EdgeInsets;
  readonly onCopy: () => void;
  readonly onHighlight: () => void;
  readonly onBoundaryMove: (boundary: 'start' | 'end', x: number, y: number) => void;
  readonly onBoundaryMoveEnd: () => void;
}

export function ReaderSelectionControls({
  copyLabel,
  highlightLabel,
  selectionLabel,
  startHandleLabel,
  endHandleLabel,
  isHighlightDisabled = false,
  rects,
  viewportWidth,
  viewportHeight,
  safeAreaInsets,
  onCopy,
  onHighlight,
  onBoundaryMove,
  onBoundaryMoveEnd,
}: ReaderSelectionControlsProps) {
  const foreground = useThemeColor('foreground');
  const selectionColor = useCSSVariable('--color-reader-selection') as string;
  const layout = computeReaderSelectionControlsLayout(
    rects,
    viewportWidth,
    viewportHeight,
    safeAreaInsets,
  );
  if (!layout) return null;

  return (
    <Fragment>
      <View
        accessibilityLabel={selectionLabel}
        accessibilityRole="toolbar"
        className="absolute z-30 h-[52px] flex-row items-center justify-center rounded-lg border border-border bg-surface px-1 shadow-lg"
        style={{
          left: layout.toolbar.left,
          top: layout.toolbar.top,
          width: ReaderSelectionToolbarWidth,
        }}>
        <Button
          accessibilityLabel={copyLabel}
          className="h-11 w-12 rounded-md px-0"
          isIconOnly
          onPress={onCopy}
          size="sm"
          variant="ghost">
          <SymbolView
            name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
            size={21}
            tintColor={foreground}
          />
        </Button>
        <View className="h-7 w-px bg-border" />
        <Button
          accessibilityLabel={highlightLabel}
          className="h-11 w-12 rounded-md px-0"
          isIconOnly
          isDisabled={isHighlightDisabled}
          onPress={onHighlight}
          size="sm"
          variant="ghost">
          <SymbolView
            name={{ ios: 'highlighter', android: 'ink_highlighter', web: 'ink_highlighter' }}
            size={22}
            tintColor={foreground}
          />
        </Button>
      </View>
      <SelectionHandle
        boundary="start"
        label={startHandleLabel}
        onMove={onBoundaryMove}
        onMoveEnd={onBoundaryMoveEnd}
        selectionColor={selectionColor}
        x={layout.startHandle.x}
        y={layout.startHandle.y}
      />
      <SelectionHandle
        boundary="end"
        label={endHandleLabel}
        onMove={onBoundaryMove}
        onMoveEnd={onBoundaryMoveEnd}
        selectionColor={selectionColor}
        x={layout.endHandle.x}
        y={layout.endHandle.y}
      />
    </Fragment>
  );
}

interface SelectionHandleProps {
  readonly boundary: 'start' | 'end';
  readonly label: string;
  readonly selectionColor: string;
  readonly x: number;
  readonly y: number;
  readonly onMove: (boundary: 'start' | 'end', x: number, y: number) => void;
  readonly onMoveEnd: () => void;
}

function SelectionHandle({
  boundary,
  label,
  selectionColor,
  x,
  y,
  onMove,
  onMoveEnd,
}: SelectionHandleProps) {
  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onUpdate((event) => onMove(
      boundary,
      event.absoluteX,
      event.absoluteY - HandleKnobCenterOffsetY,
    ))
    .onEnd(onMoveEnd), [boundary, onMove, onMoveEnd]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        collapsable={false}
        className="absolute z-30 h-12 w-12 items-center"
        style={{
          left: x - HandleTouchSize / 2,
          top: y - HandleVisualOffsetY,
        }}>
        <View className="h-3 w-0.5" style={{ backgroundColor: selectionColor }} />
        <View
          className="h-5 w-5 rounded-full border-2 border-background shadow-sm"
          style={{ backgroundColor: selectionColor }}
        />
      </View>
    </GestureDetector>
  );
}
