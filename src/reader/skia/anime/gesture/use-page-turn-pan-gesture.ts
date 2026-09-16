import { useMemo } from 'react';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ReaderSpreadMode, ReaderViewport } from '../../../contracts';
import type { ReaderPageTurnEffect } from '../core/page-turn-effect';
import {
  beginNativePagerGestureOnUI,
  cancelNativePagerGestureOnUI,
  endNativePagerGestureOnUI,
  updateNativePagerGestureOnUI,
} from '../native/pager-compositor';
import {
  planarTurnProgressForTranslation,
} from './page-turn-gesture';

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
  readonly jsSampleIndex: SharedValue<number>;
  readonly nativeActive: SharedValue<boolean>;
  readonly nativePagerId: SharedValue<number>;
  readonly nativeInputReady: SharedValue<boolean>;
  readonly nativeStockedToken: SharedValue<number>;
}

interface PageTurnPanGestureOptions {
  readonly automaticNavigationActive: boolean;
  readonly beginDrag: (x: number, y: number, token: number) => void;
  readonly endDrag: (velocityX?: number, translationX?: number, nativeReleased?: boolean) => void;
  readonly isSettling: boolean;
  readonly markNativeGestureAccepted: (token: number) => void;
  readonly pageTurnEffect: ReaderPageTurnEffect;
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
  const jsSampleIndex = useSharedValue(0);
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
    jsSampleIndex,
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
    jsSampleIndex,
  ]);
}

export function usePageTurnPanGesture({
  automaticNavigationActive,
  beginDrag,
  endDrag,
  isSettling,
  markNativeGestureAccepted,
  pageTurnEffect,
  spreadMode,
  surfaceTop,
  updateDrag,
  values,
  viewport,
}: PageTurnPanGestureOptions): PanGesture {
  const viewportWidth = viewport?.width ?? 1;
  const viewportHeight = viewport?.height ?? 1;
  const gestureBlocked = isSettling || automaticNavigationActive;
  const getGestureStartBookX = pageTurnEffect.gesture.getStartBookX;
  const getGestureGeometry = pageTurnEffect.gesture.getGeometry;
  const renderGestureProgress = pageTurnEffect.gesture.renderProgress;
  const nativeGesturePolicy = pageTurnEffect.native?.gesture;
  const nativeGestureEnabled = nativeGesturePolicy !== undefined
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
    jsSampleIndex,
  } = values;

  /* eslint-disable react-hooks/immutability */
  const gesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .maxPointers(1)
      .onStart((event) => {
        'worklet';
        if (gestureBlocked) {
          started.value = false;
          return;
        }
        started.value = true;
        directionLocked.value = false;
        direction.value = 1;
        startX.value = event.x - event.translationX;
        startBookX.value = 1;
        progress.value = 0;
        grabY.value = event.y;
        pressedEdgeX.value = 1;
        heldRollTilt.value = 0;
        nativeActive.value = false;
        nativeStockedToken.value = 0;
        token.value += 1;
        jsSampleIndex.value = 0;
        scheduleOnRN(beginDrag, event.x - event.translationX, event.y - event.translationY, token.value);
        // Recognition already includes horizontal travel. Start preparing its
        // neighbor now instead of waiting for the next update event.
        if (Math.abs(event.translationX) >= 2) {
          const initialDirection: 1 | -1 = event.translationX < 0 ? 1 : -1;
          direction.value = initialDirection;
          directionLocked.value = true;
          startBookX.value = getGestureStartBookX(startX.value, initialDirection, viewportWidth);
          const geometry = getGestureGeometry({
            startBookX: startBookX.value,
            translationX: event.translationX,
            direction: initialDirection,
            pageWidth: viewportWidth,
          });
          progress.value = renderGestureProgress({
            physicalProgress: planarTurnProgressForTranslation(
              event.translationX,
              initialDirection,
              viewportWidth,
            ),
            direction: initialDirection,
            spreadMode,
          });
          grabY.value = Math.min(
            viewportHeight,
            Math.max(0, event.absoluteY - surfaceTop),
          );
          heldRollTilt.value = geometry.heldRollTilt;
          pressedEdgeX.value = geometry.pressedEdgeX;
          jsSampleIndex.value = 1;
          scheduleOnRN(updateDrag, event.translationX, event.absoluteY, event.velocityX);
        }
      })
      .onUpdate((event) => {
        'worklet';
        if (!started.value) return;
        if (!directionLocked.value) {
          if (Math.abs(event.translationX) < 2) return;
          const nextDirection: 1 | -1 = event.translationX < 0 ? 1 : -1;
          direction.value = nextDirection;
          directionLocked.value = true;
          startBookX.value = getGestureStartBookX(
            startX.value,
            nextDirection,
            viewportWidth,
          );
        }
        const activeDirection = direction.value;
        const activeStartBookX = startBookX.value;
        const geometry = getGestureGeometry({
          startBookX: activeStartBookX,
          translationX: event.translationX,
          direction: activeDirection,
          pageWidth: viewportWidth,
        });
        const fingerX = geometry.fingerX;
        progress.value = renderGestureProgress({
          physicalProgress: planarTurnProgressForTranslation(
            event.translationX,
            activeDirection,
            viewportWidth,
          ),
          direction: activeDirection,
          spreadMode,
        });
        grabY.value = Math.min(
          viewportHeight,
          Math.max(0, event.absoluteY - surfaceTop),
        );
        heldRollTilt.value = geometry.heldRollTilt;
        pressedEdgeX.value = geometry.pressedEdgeX;
        if (
          nativeGestureEnabled
          && nativeGesturePolicy
          && nativeInputReady.value
          && nativeStockedToken.value === token.value
          && nativeGesturePolicy.canStart(activeDirection, activeStartBookX)
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
        // The shared values above drive every drawn frame. JavaScript only
        // needs periodic samples for preparation and release prediction.
        jsSampleIndex.value += 1;
        if (jsSampleIndex.value === 1 || jsSampleIndex.value % 2 === 0) {
          scheduleOnRN(updateDrag, event.translationX, event.absoluteY, event.velocityX);
        }
      })
      .onEnd((event) => {
        'worklet';
        if (!started.value) return;
        const activeDirection = direction.value;
        const activeStartBookX = startBookX.value;
        const geometry = getGestureGeometry({
          startBookX: activeStartBookX,
          translationX: event.translationX,
          direction: activeDirection,
          pageWidth: viewportWidth,
        });
        const fingerX = geometry.fingerX;
        progress.value = renderGestureProgress({
          physicalProgress: planarTurnProgressForTranslation(
            event.translationX,
            activeDirection,
            viewportWidth,
          ),
          direction: activeDirection,
          spreadMode,
        });
        grabY.value = Math.min(
          viewportHeight,
          Math.max(0, event.absoluteY - surfaceTop),
        );
        heldRollTilt.value = geometry.heldRollTilt;
        pressedEdgeX.value = geometry.pressedEdgeX;
        let nativeReleased = false;
        if (nativeActive.value) {
          const releaseTuning = nativeGesturePolicy?.getReleaseTuning(
            activeDirection,
            spreadMode,
          );
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
            pageWidth: viewportWidth,
            throwVelocity,
            throwAcceleration: 0,
            pageWeight: releaseTuning?.pageWeight ?? 1,
            commitThreshold: releaseTuning?.commitThreshold ?? 0.5,
            slowCommitEdgeX: releaseTuning?.slowCommitEdgeX ?? 0,
            minimumSpeedScale: releaseTuning?.minimumSpeedScale ?? 1,
            maximumSpeedScale: releaseTuning?.maximumSpeedScale ?? 1,
            velocityGain: releaseTuning?.velocityGain ?? 0,
            idleDecaySeconds: releaseTuning?.idleDecaySeconds ?? 0,
            releaseProjectionSeconds: releaseTuning?.releaseProjectionSeconds ?? 0,
          }) === true;
          nativeActive.value = false;
        }
        started.value = false;
        directionLocked.value = false;
        scheduleOnRN(updateDrag, event.translationX, event.absoluteY, event.velocityX);
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
      getGestureGeometry,
      getGestureStartBookX,
      markNativeGestureAccepted,
      jsSampleIndex,
      nativeActive,
      nativeGestureEnabled,
      nativeGesturePolicy,
      nativeInputReady,
      nativePagerId,
      nativeStockedToken,
      pressedEdgeX,
      progress,
      renderGestureProgress,
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
