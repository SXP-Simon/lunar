import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { Fragment, useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { ReaderSelectionDragController } from '../hooks/use-reader-selection-drag';
import type { EdgeInsets } from 'react-native-safe-area-context';

import type { ReaderRect } from '@/reader';
import { ReaderHighlightColors, type ReaderHighlightColor } from '../domain/reader-highlight';
export const ReaderSelectionToolbarWidth = 252;
export const ReaderSelectionToolbarHeight = 108;

const SelectionHoldDuration = 400;
const SelectionMovementTolerance = 4;
const ToolbarGap = 12;
const ViewportPadding = 12;

const HandleTouchSize = 48;
const HandleVisualOffsetY = 8;
const HighlightColorClasses: Record<ReaderHighlightColor, string> = {
  yellow: 'bg-reader-highlight-fill',
  pink: 'bg-reader-highlight-pink',
  purple: 'bg-reader-highlight-purple',
  blue: 'bg-reader-highlight-blue',
  green: 'bg-reader-highlight-green',
};

export function configureReaderSelectionGesture(gesture: PanGesture): PanGesture {
  return gesture
    .minDistance(SelectionMovementTolerance * 2)
    .failOffsetX([-SelectionMovementTolerance, SelectionMovementTolerance])
    .failOffsetY([-SelectionMovementTolerance, SelectionMovementTolerance])
    .maxPointers(1)
    .activateAfterLongPress(SelectionHoldDuration);
}

export interface ReaderSelectionControlsLayout {
  readonly toolbar: { readonly left: number; readonly top: number };
  readonly startHandle: { readonly x: number; readonly y: number };
  readonly endHandle: { readonly x: number; readonly y: number };
}

export function computeReaderSelectionControlsLayout(
  rects: readonly ReaderRect[],
  viewportWidth: number,
  viewportHeight: number,
  safeAreaInsets: EdgeInsets,
): ReaderSelectionControlsLayout | undefined {
  const first = rects[0];
  const last = rects.at(-1);
  if (!first || !last || viewportWidth <= 0 || viewportHeight <= 0) return undefined;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  const minimumTop = safeAreaInsets.top + ViewportPadding;
  const maximumTop = viewportHeight
    - safeAreaInsets.bottom
    - ViewportPadding
    - ReaderSelectionToolbarHeight;
  const aboveTop = minY - ToolbarGap - ReaderSelectionToolbarHeight;
  const belowTop = maxY + ToolbarGap;
  const top = aboveTop >= minimumTop
    ? aboveTop
    : Math.min(maximumTop, Math.max(minimumTop, belowTop));
  const centerX = (minX + maxX) / 2;
  const left = Math.min(
    viewportWidth - safeAreaInsets.right - ViewportPadding - ReaderSelectionToolbarWidth,
    Math.max(safeAreaInsets.left + ViewportPadding, centerX - ReaderSelectionToolbarWidth / 2),
  );
  return {
    toolbar: { left, top },
    startHandle: { x: first.x, y: first.y + first.height },
    endHandle: { x: last.x + last.width, y: last.y + last.height },
  };
}

interface ReaderSelectionControlsProps {
  readonly copyLabel: string;
  readonly highlightLabel: string;
  readonly selectionLabel: string;
  readonly startHandleLabel: string;
  readonly endHandleLabel: string;
  readonly isHighlightDisabled?: boolean;
  readonly isExistingHighlight: boolean;
  readonly selectedColor: ReaderHighlightColor;
  readonly colorLabels: Readonly<Record<ReaderHighlightColor, string>>;
  readonly onColorChange: (color: ReaderHighlightColor) => void;
  readonly rects: readonly ReaderRect[];
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly safeAreaInsets: EdgeInsets;
  readonly onCopy: () => void;
  readonly onHighlight: () => void;
  readonly drag: ReaderSelectionDragController;
}

export function ReaderSelectionControls({
  copyLabel,
  highlightLabel,
  selectionLabel,
  startHandleLabel,
  endHandleLabel,
  isHighlightDisabled = false,
  isExistingHighlight,
  selectedColor,
  colorLabels,
  onColorChange,
  rects,
  viewportWidth,
  viewportHeight,
  safeAreaInsets,
  onCopy,
  onHighlight,
  drag,
}: ReaderSelectionControlsProps) {
  const foreground = useThemeColor('foreground');
  const { dragging } = drag.binding;
  const toolbarStyle = useAnimatedStyle(() => ({ opacity: dragging.value ? 0 : 1 }));
  const layout = computeReaderSelectionControlsLayout(
    rects,
    viewportWidth,
    viewportHeight,
    safeAreaInsets,
  );
  if (!layout) return null;

  return (
    <Fragment>
      <Animated.View
        accessibilityLabel={selectionLabel}
        accessibilityRole="toolbar"
        className="absolute z-30 h-[108px] justify-center rounded-2xl border border-border bg-surface px-2 shadow-lg"
        style={[{
          left: layout.toolbar.left,
          top: layout.toolbar.top,
          width: ReaderSelectionToolbarWidth,
        }, toolbarStyle]}>
        <View className="h-12 flex-row items-center justify-center">
          {ReaderHighlightColors.map((color) => (
            <Button
              key={color}
              accessibilityLabel={colorLabels[color]}
              accessibilityState={{ selected: selectedColor === color }}
              className="h-11 w-11 rounded-full px-0"
              isIconOnly
              isDisabled={isHighlightDisabled}
              onPress={() => onColorChange(color)}
              size="sm"
              variant="ghost">
              <View className={`h-7 w-7 items-center justify-center rounded-full ${HighlightColorClasses[color]}`}>
                {selectedColor === color && (
                  <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={17} tintColor={foreground} />
                )}
              </View>
            </Button>
          ))}
        </View>
        <View className="h-px bg-border" />
        <View className="h-12 flex-row items-center justify-center">
          <Button
            accessibilityLabel={copyLabel}
            className="h-11 flex-1 rounded-md px-1"
            onPress={onCopy}
            size="sm"
            variant="ghost">
            <SymbolView
              name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
              size={21}
              tintColor={foreground}
            />
            <Button.Label className="text-xs">{copyLabel}</Button.Label>
          </Button>
          <View className="h-7 w-px bg-border" />
          <Button
            accessibilityLabel={highlightLabel}
            className="h-11 flex-1 rounded-md px-1"
            isDisabled={isHighlightDisabled}
            onPress={onHighlight}
            size="sm"
            variant="ghost">
            <SymbolView
              name={isExistingHighlight
                ? { ios: 'trash', android: 'delete', web: 'delete' }
                : { ios: 'highlighter', android: 'ink_highlighter', web: 'ink_highlighter' }}
              size={22}
              tintColor={foreground}
            />
            <Button.Label className="text-xs">{highlightLabel}</Button.Label>
          </Button>
        </View>
      </Animated.View>
      <SelectionHandle
        boundary="start"
        label={startHandleLabel}
        drag={drag}
      />
      <SelectionHandle
        boundary="end"
        label={endHandleLabel}
        drag={drag}
      />
    </Fragment>
  );
}

interface SelectionHandleProps {
  readonly boundary: 'start' | 'end';
  readonly label: string;
  readonly drag: ReaderSelectionDragController;
}

function SelectionHandle({ boundary, label, drag }: SelectionHandleProps) {
  const { begin, moveHandle, finish, binding } = drag;
  const position = boundary === 'start' ? binding.startHandle : binding.endHandle;
  const style = useAnimatedStyle(() => ({ transform: [
    { translateX: position.value.x - HandleTouchSize / 2 },
    { translateY: position.value.y - HandleVisualOffsetY },
  ] }));
  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      'worklet';
      begin(boundary);
    })
    .onUpdate(event => {
      'worklet';
      moveHandle(boundary, event.translationX, event.translationY);
    })
    .onEnd((event, success) => {
      'worklet';
      moveHandle(boundary, event.translationX, event.translationY);
      finish(!success);
    })
    .onFinalize((_event, success) => {
      'worklet';
      if (!success) finish(true);
    }), [begin, boundary, finish, moveHandle]);

  // Transparent native targets retain touch capture and accessibility. The
  // knob and stem are painted with the selection in the reader's Skia Canvas.
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View accessible accessibilityLabel={label} accessibilityRole="adjustable"
        collapsable={false} className="absolute left-0 top-0 z-30 h-12 w-12" style={style} />
    </GestureDetector>
  );
}
