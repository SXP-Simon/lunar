import type { PanGesture } from 'react-native-gesture-handler';

const SelectionHoldDuration = 500;
const SelectionMovementTolerance = 2;

export function configureReaderSelectionGesture(gesture: PanGesture): PanGesture {
  return gesture
    .minDistance(SelectionMovementTolerance * 2)
    .failOffsetX([-SelectionMovementTolerance, SelectionMovementTolerance])
    .failOffsetY([-SelectionMovementTolerance, SelectionMovementTolerance])
    .maxPointers(1)
    .activateAfterLongPress(SelectionHoldDuration);
}
