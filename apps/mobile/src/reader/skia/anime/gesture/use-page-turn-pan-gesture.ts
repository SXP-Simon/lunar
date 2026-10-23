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
  directedThrowVelocity,
  gestureSampleClockMs,
  GESTURE_RELEASE_IDLE_DECAY_SECONDS,
  planarTurnProgressForTranslation,
  releaseIdleDecay,
  trackThrowAcceleration,
  trackThrowVelocity,
  type PageTurnReleaseSample,
} from './page-turn-gesture';

export interface PageTurnGestureValues {
  readonly progress: SharedValue<number>;
  readonly started: SharedValue<boolean>;
  readonly releasePending: SharedValue<boolean>;
  readonly directionLocked: SharedValue<boolean>;
  readonly direction: SharedValue<1 | -1>;
  readonly startX: SharedValue<number>;
  readonly startBookX: SharedValue<number>;
  readonly grabY: SharedValue<number>;
  readonly pressedEdgeX: SharedValue<number>;
  readonly heldRollTilt: SharedValue<number>;
  readonly token: SharedValue<number>;
  readonly dragThrowVelocity: SharedValue<number>;
  readonly dragThrowAcceleration: SharedValue<number>;
  readonly lastSampleAtMs: SharedValue<number>;
  readonly jsSampleIndex: SharedValue<number>;
  readonly nativeActive: SharedValue<boolean>;
  readonly nativePagerId: SharedValue<number>;
  readonly nativeInputReady: SharedValue<boolean>;
  readonly nativeStockedToken: SharedValue<number>;
}

interface PageTurnPanGestureOptions {
  readonly automaticNavigationActive: boolean;
  readonly beginDrag: (x: number, y: number, token: number) => void;
  readonly endDrag: (
    velocityX?: number,
    translationX?: number,
    nativeReleased?: boolean,
    release?: PageTurnReleaseSample,
  ) => void;
  readonly isSettling: boolean;
  readonly markNativeGestureAccepted: (token: number) => void;
  readonly pageTurnEffect: ReaderPageTurnEffect;
  readonly spreadMode: ReaderSpreadMode;
  readonly surfaceTop: number;
  readonly updateDrag: (
    translationX: number,
    absoluteY: number,
    throwVelocity: number,
    throwAcceleration: number,
  ) => void;
  readonly values: PageTurnGestureValues;
  readonly viewport?: ReaderViewport;
}

export function usePageTurnGestureValues(): PageTurnGestureValues {
  const progress = useSharedValue(0);
  const started = useSharedValue(false);
  const releasePending = useSharedValue(false);
  const directionLocked = useSharedValue(false);
  const direction = useSharedValue<1 | -1>(1);
  const startX = useSharedValue(0);
  const startBookX = useSharedValue(1);
  const grabY = useSharedValue(0);
  const pressedEdgeX = useSharedValue(1);
  const heldRollTilt = useSharedValue(0);
  const token = useSharedValue(0);
  const dragThrowVelocity = useSharedValue(0);
  const dragThrowAcceleration = useSharedValue(0);
  const lastSampleAtMs = useSharedValue(0);
  const jsSampleIndex = useSharedValue(0);
  const nativeActive = useSharedValue(false);
  const nativePagerId = useSharedValue(-1);
  const nativeInputReady = useSharedValue(false);
  const nativeStockedToken = useSharedValue(0);

  return useMemo(
    () => ({
      progress,
      started,
      releasePending,
      directionLocked,
      direction,
      startX,
      startBookX,
      grabY,
      pressedEdgeX,
      heldRollTilt,
      token,
      dragThrowVelocity,
      dragThrowAcceleration,
      lastSampleAtMs,
      jsSampleIndex,
      nativeActive,
      nativePagerId,
      nativeInputReady,
      nativeStockedToken,
    }),
    [
      direction,
      directionLocked,
      dragThrowAcceleration,
      dragThrowVelocity,
      grabY,
      heldRollTilt,
      lastSampleAtMs,
      nativeActive,
      nativeInputReady,
      nativePagerId,
      nativeStockedToken,
      pressedEdgeX,
      progress,
      started,
      releasePending,
      startBookX,
      startX,
      token,
      jsSampleIndex,
    ],
  );
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
  const nativeGestureEnabled = nativeGesturePolicy !== undefined && spreadMode === 'single';
  const {
    direction,
    directionLocked,
    dragThrowAcceleration,
    dragThrowVelocity,
    grabY,
    heldRollTilt,
    lastSampleAtMs,
    nativeActive,
    nativeInputReady,
    nativePagerId,
    nativeStockedToken,
    pressedEdgeX,
    progress,
    started,
    releasePending,
    startBookX,
    startX,
    token,
    jsSampleIndex,
  } = values;

  /* eslint-disable react-hooks/immutability */
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .failOffsetY([-20, 20])
        .maxPointers(1)
        .cancelsTouchesInView(true)
        .onStart((event) => {
          'worklet';
          if (gestureBlocked || releasePending.value) {
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
          dragThrowVelocity.value = 0;
          dragThrowAcceleration.value = 0;
          lastSampleAtMs.value = gestureSampleClockMs();
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
              physicalProgress: planarTurnProgressForTranslation(event.translationX, initialDirection, viewportWidth),
              direction: initialDirection,
              spreadMode,
            });
            grabY.value = Math.min(viewportHeight, Math.max(0, event.absoluteY - surfaceTop));
            heldRollTilt.value = geometry.heldRollTilt;
            pressedEdgeX.value = geometry.pressedEdgeX;
            // Recognition already measured this travel, so its pan velocity
            // seeds the track instead of being blended in from rest.
            dragThrowVelocity.value = directedThrowVelocity(event.velocityX, initialDirection, viewportWidth);
            jsSampleIndex.value = 1;
            scheduleOnRN(updateDrag, event.translationX, event.absoluteY, dragThrowVelocity.value, 0);
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
            startBookX.value = getGestureStartBookX(startX.value, nextDirection, viewportWidth);
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
            physicalProgress: planarTurnProgressForTranslation(event.translationX, activeDirection, viewportWidth),
            direction: activeDirection,
            spreadMode,
          });
          grabY.value = Math.min(viewportHeight, Math.max(0, event.absoluteY - surfaceTop));
          heldRollTilt.value = geometry.heldRollTilt;
          pressedEdgeX.value = geometry.pressedEdgeX;
          if (
            nativeGestureEnabled &&
            nativeGesturePolicy &&
            nativeInputReady.value &&
            nativeStockedToken.value === token.value &&
            nativeGesturePolicy.canStart(activeDirection, activeStartBookX)
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
          const sampledAtMs = gestureSampleClockMs();
          const sampleSeconds = (sampledAtMs - lastSampleAtMs.value) / 1000;
          const previousThrowVelocity = dragThrowVelocity.value;
          dragThrowVelocity.value = trackThrowVelocity(
            previousThrowVelocity,
            event.velocityX,
            activeDirection,
            viewportWidth,
            sampleSeconds,
          );
          dragThrowAcceleration.value = trackThrowAcceleration(
            dragThrowAcceleration.value,
            previousThrowVelocity,
            dragThrowVelocity.value,
            sampleSeconds,
          );
          lastSampleAtMs.value = sampledAtMs;
          // The shared values above drive every drawn frame. JavaScript only
          // needs periodic samples for preparation and release prediction.
          // Native owns intermediate frames once it runs; the final sample in
          // onEnd still updates RN release state.
          jsSampleIndex.value += 1;
          if ((jsSampleIndex.value === 1 || jsSampleIndex.value % 2 === 0) && !nativeActive.value) {
            scheduleOnRN(
              updateDrag,
              event.translationX,
              event.absoluteY,
              dragThrowVelocity.value,
              dragThrowAcceleration.value,
            );
          }
        })
        .onEnd((event) => {
          'worklet';
          if (!started.value) return;
          releasePending.value = true;
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
            physicalProgress: planarTurnProgressForTranslation(event.translationX, activeDirection, viewportWidth),
            direction: activeDirection,
            spreadMode,
          });
          grabY.value = Math.min(viewportHeight, Math.max(0, event.absoluteY - surfaceTop));
          heldRollTilt.value = geometry.heldRollTilt;
          pressedEdgeX.value = geometry.pressedEdgeX;
          const releaseTuning = nativeGesturePolicy?.getReleaseTuning(activeDirection, spreadMode);
          // A finger that rested before lifting has spent its throw. The final
          // pan velocity still sets the release, so a last-moment flick back
          // toward the source can cancel the turn.
          const idleDecay = releaseIdleDecay(
            (gestureSampleClockMs() - lastSampleAtMs.value) / 1000,
            releaseTuning?.idleDecaySeconds ?? GESTURE_RELEASE_IDLE_DECAY_SECONDS,
          );
          const release: PageTurnReleaseSample = {
            throwVelocity: directedThrowVelocity(event.velocityX, activeDirection, viewportWidth) * idleDecay,
            throwAcceleration: dragThrowAcceleration.value * idleDecay,
            idleDecay,
          };
          let nativeReleased = false;
          if (nativeActive.value) {
            updateNativePagerGestureOnUI(nativePagerId.value, {
              fingerX,
              turnProgress: progress.value,
            });
            // The native pager decides a single-page release, so it is handed
            // the same sample the JavaScript decision reads. Its own idle clock
            // restarts at the update above, so the decay applied here is the
            // only one.
            const { throwVelocity, throwAcceleration } = release;
            nativeReleased =
              endNativePagerGestureOnUI(nativePagerId.value, {
                fingerX,
                pageWidth: viewportWidth,
                throwVelocity,
                throwAcceleration,
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
          scheduleOnRN(
            updateDrag,
            event.translationX,
            event.absoluteY,
            dragThrowVelocity.value,
            dragThrowAcceleration.value,
          );
          scheduleOnRN(endDrag, event.velocityX, event.translationX, nativeReleased, release);
        })
        .onFinalize(() => {
          'worklet';
          if (started.value) {
            releasePending.value = true;
            const nativeCancelled = nativeActive.value && cancelNativePagerGestureOnUI(nativePagerId.value) === true;
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
      dragThrowAcceleration,
      dragThrowVelocity,
      endDrag,
      grabY,
      heldRollTilt,
      gestureBlocked,
      getGestureGeometry,
      getGestureStartBookX,
      lastSampleAtMs,
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
      releasePending,
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
