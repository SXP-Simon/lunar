import { useMemo } from 'react';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ReaderSpreadMode, ReaderViewport } from '../../../contracts';
import type { ReaderPageAnimationStyle } from '../core/page-turn-types';
import { resolveReaderPageAnimationStyle } from '../core/page-turn-timing';
import {
  beginNativePagerGestureOnUI,
  cancelNativePagerGestureOnUI,
  endNativePagerGestureOnUI,
  updateNativePagerGestureOnUI,
} from '../native/pager-compositor';
import {
  anchoredGestureFingerX,
  bookXForGestureTravel,
  gestureLiftRotationForFingerX,
  gesturePressedChordForFingerX,
  pageTurnRenderProgress,
  pageTurnStartBookXForTouch,
  planarTurnProgressForTranslation,
} from './page-turn-gesture';

const NATIVE_GESTURE_MINIMUM_START_BOOK_X = 0.25;
const NATIVE_GESTURE_MINIMUM_SPEED_SCALE = 1;
const NATIVE_GESTURE_MAXIMUM_SPEED_SCALE = 2.2;
const NATIVE_GESTURE_VELOCITY_GAIN = 0.35;
const NATIVE_GESTURE_IDLE_DECAY_SECONDS = 0.08;

export interface PageTurnGestureValues {
  readonly progress: SharedValue<number>;
  readonly started: SharedValue<boolean>;
  readonly directionLocked: SharedValue<boolean>;
  readonly direction: SharedValue<1 | -1>;
  readonly startX: SharedValue<number>;
  readonly startBookX: SharedValue<number>;
  readonly grabY: SharedValue<number>;
  readonly pressedEdgeX: SharedValue<number>;
  readonly heldRollTilt: SharedValue<number>;
  readonly token: SharedValue<number>;
  readonly nativeActive: SharedValue<boolean>;
  readonly nativePagerId: SharedValue<number>;
  readonly nativeInputReady: SharedValue<boolean>;
  readonly nativeStockedToken: SharedValue<number>;
}

interface PageTurnPanGestureOptions {
  readonly animationStyle: ReaderPageAnimationStyle;
  readonly automaticNavigationActive: boolean;
  readonly beginDrag: (x: number, y: number, token: number) => void;
  readonly endDrag: (velocityX?: number, translationX?: number, nativeReleased?: boolean) => void;
  readonly isSettling: boolean;
  readonly markNativeGestureAccepted: (token: number) => void;
  readonly spreadMode: ReaderSpreadMode;
  readonly surfaceTop: number;
  readonly updateDrag: (translationX: number, absoluteY: number, velocityX: number) => void;
  readonly values: PageTurnGestureValues;
  readonly viewport?: ReaderViewport;
}

export function usePageTurnGestureValues(): PageTurnGestureValues {
  const progress = useSharedValue(0);
  const started = useSharedValue(false);
  const directionLocked = useSharedValue(false);
  const direction = useSharedValue<1 | -1>(1);
  const startX = useSharedValue(0);
  const startBookX = useSharedValue(1);
  const grabY = useSharedValue(0);
  const pressedEdgeX = useSharedValue(1);
  const heldRollTilt = useSharedValue(0);
  const token = useSharedValue(0);
  const nativeActive = useSharedValue(false);
  const nativePagerId = useSharedValue(-1);
  const nativeInputReady = useSharedValue(false);
  const nativeStockedToken = useSharedValue(0);

  return useMemo(() => ({
    progress,
    started,
    directionLocked,
    direction,
    startX,
    startBookX,
    grabY,
    pressedEdgeX,
    heldRollTilt,
    token,
    nativeActive,
    nativePagerId,
    nativeInputReady,
    nativeStockedToken,
  }), [
    direction,
    directionLocked,
    grabY,
    heldRollTilt,
    nativeActive,
    nativeInputReady,
    nativePagerId,
    nativeStockedToken,
    pressedEdgeX,
    progress,
    started,
    startBookX,
    startX,
    token,
  ]);
}

export function usePageTurnPanGesture({
  animationStyle,
  automaticNavigationActive,
  beginDrag,
  endDrag,
  isSettling,
  markNativeGestureAccepted,
  spreadMode,
  surfaceTop,
  updateDrag,
  values,
  viewport,
}: PageTurnPanGestureOptions): PanGesture {
  const viewportWidth = viewport?.width ?? 1;
  const viewportHeight = viewport?.height ?? 1;
  const gestureBlocked = isSettling || automaticNavigationActive;
  const nativeGestureEnabled = resolveReaderPageAnimationStyle(animationStyle) === 'page'
    && spreadMode === 'single';
  const {
    direction,
    directionLocked,
    grabY,
    heldRollTilt,
    nativeActive,
    nativeInputReady,
    nativePagerId,
    nativeStockedToken,
    pressedEdgeX,
    progress,
    started,
    startBookX,
    startX,
    token,
  } = values;

  /* eslint-disable react-hooks/immutability */
  const gesture = useMemo(
    () => Gesture.Pan()
      .minDistance(2)
      .onBegin((event) => {
        'worklet';
        if (gestureBlocked) {
          started.value = false;
          return;
        }
        started.value = true;
        directionLocked.value = false;
        direction.value = 1;
        startX.value = event.x;
        startBookX.value = 1;
        progress.value = 0;
        grabY.value = event.y;
        pressedEdgeX.value = 1;
        heldRollTilt.value = 0;
        nativeActive.value = false;
        nativeStockedToken.value = 0;
        token.value += 1;
        scheduleOnRN(beginDrag, event.x, event.y, token.value);
      })
      .onUpdate((event) => {
        'worklet';
        if (!started.value) return;
        if (!directionLocked.value) {
          if (Math.abs(event.translationX) < 2) return;
          const nextDirection: 1 | -1 = event.translationX < 0 ? 1 : -1;
          direction.value = nextDirection;
          directionLocked.value = true;
          startBookX.value = pageTurnStartBookXForTouch(
            startX.value,
            nextDirection,
            viewportWidth,
          );
        }
        const activeDirection = direction.value;
        const activeStartBookX = startBookX.value;
        const currentBookX = bookXForGestureTravel(
          activeStartBookX,
          event.translationX,
          activeDirection,
          viewportWidth,
        );
        const fingerX = anchoredGestureFingerX(activeStartBookX, currentBookX);
        const rollTilt = gestureLiftRotationForFingerX(fingerX);
        progress.value = pageTurnRenderProgress(
          planarTurnProgressForTranslation(event.translationX, viewportWidth),
          activeDirection,
          spreadMode,
        );
        grabY.value = Math.min(
          viewportHeight,
          Math.max(0, event.absoluteY - surfaceTop),
        );
        heldRollTilt.value = rollTilt;
        pressedEdgeX.value = gesturePressedChordForFingerX(fingerX, rollTilt);
        if (
          nativeGestureEnabled
          && nativeInputReady.value
          && nativeStockedToken.value === token.value
          && (activeDirection < 0 || activeStartBookX >= NATIVE_GESTURE_MINIMUM_START_BOOK_X)
        ) {
          if (nativeActive.value) {
            updateNativePagerGestureOnUI(nativePagerId.value, {
              fingerX,
              turnProgress: progress.value,
            });
          } else {
            const accepted = beginNativePagerGestureOnUI(nativePagerId.value, {
              direction: activeDirection,
              startBookX: activeStartBookX,
              fingerX,
              turnProgress: progress.value,
            });
            if (accepted === true) {
              nativeActive.value = true;
              scheduleOnRN(markNativeGestureAccepted, token.value);
            }
          }
        }
        scheduleOnRN(updateDrag, event.translationX, event.absoluteY, event.velocityX);
      })
      .onEnd((event) => {
        'worklet';
        if (!started.value) return;
        const activeDirection = direction.value;
        const activeStartBookX = startBookX.value;
        const currentBookX = bookXForGestureTravel(
          activeStartBookX,
          event.translationX,
          activeDirection,
          viewportWidth,
        );
        const fingerX = anchoredGestureFingerX(activeStartBookX, currentBookX);
        const rollTilt = gestureLiftRotationForFingerX(fingerX);
        progress.value = pageTurnRenderProgress(
          planarTurnProgressForTranslation(event.translationX, viewportWidth),
          activeDirection,
          spreadMode,
        );
        grabY.value = Math.min(
          viewportHeight,
          Math.max(0, event.absoluteY - surfaceTop),
        );
        heldRollTilt.value = rollTilt;
        pressedEdgeX.value = gesturePressedChordForFingerX(fingerX, rollTilt);
        let nativeReleased = false;
        if (nativeActive.value) {
          updateNativePagerGestureOnUI(nativePagerId.value, {
            fingerX,
            turnProgress: progress.value,
          });
          const throwVelocity = Math.max(
            0,
            (activeDirection === 1 ? -event.velocityX : event.velocityX)
              / Math.max(1, viewportWidth),
          );
          nativeReleased = endNativePagerGestureOnUI(nativePagerId.value, {
            fingerX,
            throwVelocity,
            throwAcceleration: 0,
            pageWeight: 1,
            commitThreshold: 0.5,
            slowCommitEdgeX: 0,
            minimumSpeedScale: NATIVE_GESTURE_MINIMUM_SPEED_SCALE,
            maximumSpeedScale: NATIVE_GESTURE_MAXIMUM_SPEED_SCALE,
            velocityGain: NATIVE_GESTURE_VELOCITY_GAIN,
            idleDecaySeconds: NATIVE_GESTURE_IDLE_DECAY_SECONDS,
          }) === true;
          nativeActive.value = false;
        }
        started.value = false;
        directionLocked.value = false;
        scheduleOnRN(endDrag, event.velocityX, event.translationX, nativeReleased);
      })
      .onFinalize(() => {
        'worklet';
        if (started.value) {
          const nativeCancelled = nativeActive.value
            && cancelNativePagerGestureOnUI(nativePagerId.value) === true;
          nativeActive.value = false;
          started.value = false;
          directionLocked.value = false;
          scheduleOnRN(endDrag, 0, Number.NaN, nativeCancelled);
        }
      }),
    [
      beginDrag,
      direction,
      directionLocked,
      endDrag,
      grabY,
      heldRollTilt,
      gestureBlocked,
      markNativeGestureAccepted,
      nativeActive,
      nativeGestureEnabled,
      nativeInputReady,
      nativePagerId,
      nativeStockedToken,
      pressedEdgeX,
      progress,
      spreadMode,
      started,
      startBookX,
      startX,
      surfaceTop,
      token,
      updateDrag,
      viewportHeight,
      viewportWidth,
    ],
  );
  /* eslint-enable react-hooks/immutability */

  return gesture;
}
