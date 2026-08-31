import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ReaderSnapshot, ReaderViewport } from '../../contracts';
import type { LunarReaderRuntime } from '../../runtime/core/native-reader-runtime';
import {
  anchoredGestureFingerX,
  bookXForGestureTravel,
  gestureLiftRotationForFingerX,
  gesturePressedChordForFingerX,
  pageTurnStartBookXForTouch,
  postHingeTurnProgressForFingerX,
  shouldCommitTurn,
  visualTurnProgressForFingerX,
} from './page-turn-gesture';
import { getReaderPageTurnDuration } from './page-turn-timing';
import type {
  ReaderInteractiveTurn,
  ReaderPageAnimationStyle,
  ReaderPageContent,
} from './page-transition';

interface ReaderDragState {
  readonly revisionId: number;
  readonly startSpread: number;
  readonly startX: number;
  direction: 1 | -1;
  directionLocked: boolean;
  targetSpread: number;
  startBookX: number;
  latestProgress: number;
  renderProgress: number;
  grabX: number;
  grabY: number;
  fingerX: number;
  pressedEdgeX: number;
  heldRollTilt: number;
  throwVelocity: number;
  throwAcceleration: number;
  preparing: boolean;
  prepared: boolean;
}

export interface UseReaderPageTurnOptions {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly viewport?: ReaderViewport;
  readonly animationStyle?: ReaderPageAnimationStyle;
  readonly animationDuration?: number;
  /** Vertical viewport offset of the reader surface, used with absolute gesture coordinates. */
  readonly surfaceTop?: number;
}

export interface ReaderPageTurnController {
  readonly gesture: PanGesture;
  readonly interactiveTurn?: ReaderInteractiveTurn;
  readonly isSettling: boolean;
  next(): Promise<ReaderSnapshot>;
  previous(): Promise<ReaderSnapshot>;
}

export function useReaderPageTurn({
  runtime,
  snapshot,
  viewport,
  animationStyle = 'slide',
  animationDuration = 360,
  surfaceTop = 0,
}: UseReaderPageTurnOptions): ReaderPageTurnController {
  const dragState = useRef<ReaderDragState | undefined>(undefined);
  const handoffGeneration = useRef(0);
  const gestureProgress = useSharedValue(0);
  const gestureStarted = useSharedValue(false);
  const gestureDirectionLocked = useSharedValue(false);
  const gestureDirection = useSharedValue<1 | -1>(1);
  const gestureStartX = useSharedValue(0);
  const gestureStartBookX = useSharedValue(1);
  const [interactiveTurn, setInteractiveTurn] = useState<ReaderInteractiveTurn>();
  const isReady = snapshot.phase === 'ready';
  const totalSpreads = snapshot.totalSpreads;

  const beginDrag = useCallback((startX: number, startY: number) => {
    if (!isReady || !viewport || interactiveTurn?.settling) return;
    handoffGeneration.current += 1;
    dragState.current = {
      revisionId: snapshot.revisionId,
      startSpread: snapshot.spreadIndex,
      startX,
      direction: 1,
      directionLocked: false,
      targetSpread: snapshot.spreadIndex + 1,
      startBookX: 1,
      latestProgress: 0,
      renderProgress: 0,
      grabX: Math.min(viewport.width, Math.max(0, startX)),
      grabY: startY,
      fingerX: 1,
      pressedEdgeX: 1,
      heldRollTilt: 0,
      throwVelocity: 0,
      throwAcceleration: 0,
      preparing: false,
      prepared: false,
    };
  }, [interactiveTurn?.settling, isReady, snapshot.revisionId, snapshot.spreadIndex, viewport]);

  const updateDrag = useCallback((translationX: number, absoluteY: number, velocityX: number) => {
    const state = dragState.current;
    if (!state || !viewport || !isReady) return;
    if (!state.directionLocked) {
      if (Math.abs(translationX) < 2) return;
      state.direction = translationX < 0 ? 1 : -1;
      state.directionLocked = true;
    }

    const direction = state.direction;
    const targetSpread = state.startSpread + direction;
    state.startBookX = pageTurnStartBookXForTouch(state.startX, direction, viewport.width);
    const currentBookX = bookXForGestureTravel(
      state.startBookX,
      translationX,
      direction,
      viewport.width,
    );
    state.fingerX = anchoredGestureFingerX(state.startBookX, currentBookX);
    state.heldRollTilt = gestureLiftRotationForFingerX(state.fingerX);
    state.pressedEdgeX = gesturePressedChordForFingerX(state.fingerX, state.heldRollTilt);
    state.latestProgress = postHingeTurnProgressForFingerX(state.fingerX, state.startBookX);
    state.renderProgress = Math.max(
      state.latestProgress,
      visualTurnProgressForFingerX(state.fingerX),
    );
    const instantaneousThrowVelocity = Math.max(
      0,
      (direction === 1 ? -velocityX : velocityX) / Math.max(1, viewport.width),
    );
    state.throwAcceleration = Math.max(
      0,
      (instantaneousThrowVelocity - state.throwVelocity) * 60,
    );
    state.throwVelocity += (instantaneousThrowVelocity - state.throwVelocity) * 0.35;
    state.grabY = Math.min(viewport.height, Math.max(0, absoluteY - surfaceTop));

    if (state.targetSpread !== targetSpread) {
      state.targetSpread = targetSpread;
      state.preparing = false;
      state.prepared = false;
      setInteractiveTurn(undefined);
    }
    if (targetSpread < 0 || (totalSpreads !== undefined && targetSpread >= totalSpreads)) return;

    if (!state.preparing && !state.prepared) {
      state.preparing = true;
      const revisionId = state.revisionId;
      void runtime.prepareSpread(targetSpread).then((prepared) => {
        const current = dragState.current;
        if (
          !prepared
          || !current
          || current.revisionId !== revisionId
          || current.targetSpread !== targetSpread
          || current.direction !== direction
          || runtime.getSnapshot().revisionId !== revisionId
        ) {
          return;
        }
        const targetPicture = runtime.getCurrentPicture(revisionId, targetSpread);
        const targetFrame = runtime.getCurrentFrame(targetSpread);
        if (!targetPicture || !targetFrame) return;
        current.prepared = true;
        setInteractiveTurn({
          content: {
            key: `${revisionId}:${targetSpread}:drag`,
            snapshot: { ...snapshot, spreadIndex: targetSpread, renderId: undefined },
            picture: targetPicture,
            frame: targetFrame,
          } satisfies ReaderPageContent,
          progress: current.renderProgress,
          progressValue: gestureProgress,
          grabX: current.grabX,
          grabY: current.grabY,
          pressedEdgeX: current.pressedEdgeX,
          heldRollTilt: current.heldRollTilt,
          fingerX: current.fingerX,
          throwVelocity: current.throwVelocity,
          throwAcceleration: current.throwAcceleration,
        });
      });
    }

    if (state.prepared) {
      setInteractiveTurn((turn) => turn ? {
        ...turn,
        progress: state.renderProgress,
        grabX: state.grabX,
        grabY: state.grabY,
        pressedEdgeX: state.pressedEdgeX,
        heldRollTilt: state.heldRollTilt,
        fingerX: state.fingerX,
        throwVelocity: state.throwVelocity,
        throwAcceleration: state.throwAcceleration,
      } : turn);
    }
  }, [gestureProgress, isReady, runtime, snapshot, surfaceTop, totalSpreads, viewport]);

  const endDrag = useCallback((releaseVelocity = 0, releaseTranslationX = 0) => {
    if (interactiveTurn?.settling) return;
    const state = dragState.current;
    dragState.current = undefined;
    if (!state?.directionLocked) {
      setInteractiveTurn(undefined);
      return;
    }

    if (viewport && Number.isFinite(releaseTranslationX)) {
      const currentBookX = bookXForGestureTravel(
        state.startBookX,
        releaseTranslationX,
        state.direction,
        viewport.width,
      );
      state.fingerX = anchoredGestureFingerX(state.startBookX, currentBookX);
      state.heldRollTilt = gestureLiftRotationForFingerX(state.fingerX);
      state.pressedEdgeX = gesturePressedChordForFingerX(state.fingerX, state.heldRollTilt);
      state.latestProgress = postHingeTurnProgressForFingerX(state.fingerX, state.startBookX);
      state.renderProgress = Math.max(
        state.latestProgress,
        visualTurnProgressForFingerX(state.fingerX),
      );
    }

    const terminalThrowVelocity = viewport
      ? Math.max(
          0,
          (state.direction === 1 ? -releaseVelocity : releaseVelocity) / Math.max(1, viewport.width),
        )
      : 0;
    const throwVelocity = Math.max(state.throwVelocity, terminalThrowVelocity);
    if (!shouldCommitTurn(state.fingerX, throwVelocity, state.throwAcceleration)) {
      setInteractiveTurn(undefined);
      return;
    }

    const normalizedVelocity = viewport
      ? Math.abs(releaseVelocity) / Math.max(1, viewport.width)
      : 0;
    if (!state.prepared) {
      setInteractiveTurn(undefined);
      void (state.direction > 0 ? runtime.next() : runtime.previous());
      return;
    }

    setInteractiveTurn((turn) => turn ? {
      ...turn,
      progress: state.renderProgress,
      progressValue: gestureProgress,
      pressedEdgeX: state.pressedEdgeX,
      heldRollTilt: state.heldRollTilt,
      fingerX: state.fingerX,
      releaseVelocity: normalizedVelocity,
      throwVelocity,
      settling: true,
      settleTo: 1,
    } : turn);
    const navigate = state.direction > 0 ? runtime.next() : runtime.previous();
    const settleDuration = getReaderPageTurnDuration(
      animationStyle,
      normalizedVelocity,
      animationDuration,
    );
    const generation = ++handoffGeneration.current;
    void Promise.allSettled([navigate, waitForPageTurn(settleDuration)]).then(() => {
      if (handoffGeneration.current !== generation) return;
      if (runtime.getSnapshot().spreadIndex !== state.targetSpread) {
        setInteractiveTurn(undefined);
        return;
      }
      void waitForPageHandoffFrames().then(() => {
        if (handoffGeneration.current === generation) setInteractiveTurn(undefined);
      });
    });
  }, [animationDuration, animationStyle, gestureProgress, interactiveTurn?.settling, runtime, viewport]);

  /* eslint-disable react-hooks/refs, react-hooks/immutability */
  const viewportWidth = viewport?.width ?? 1;
  const isSettling = interactiveTurn?.settling === true;
  const gesture = useMemo(
    () => Gesture.Pan()
      .minDistance(2)
      .onBegin((event) => {
        'worklet';
        if (isSettling) {
          gestureStarted.value = false;
          return;
        }
        gestureStarted.value = true;
        gestureDirectionLocked.value = false;
        gestureDirection.value = 1;
        gestureStartX.value = event.x;
        gestureStartBookX.value = 1;
        gestureProgress.value = 0;
        scheduleOnRN(beginDrag, event.x, event.y);
      })
      .onUpdate((event) => {
        'worklet';
        if (!gestureStarted.value) return;
        if (!gestureDirectionLocked.value) {
          if (Math.abs(event.translationX) < 2) return;
          const direction: 1 | -1 = event.translationX < 0 ? 1 : -1;
          gestureDirection.value = direction;
          gestureDirectionLocked.value = true;
          gestureStartBookX.value = pageTurnStartBookXForTouch(
            gestureStartX.value,
            direction,
            viewportWidth,
          );
        }
        const direction = gestureDirection.value;
        const startBookX = gestureStartBookX.value;
        const currentBookX = bookXForGestureTravel(
          startBookX,
          event.translationX,
          direction,
          viewportWidth,
        );
        const fingerX = anchoredGestureFingerX(startBookX, currentBookX);
        gestureProgress.value = Math.max(
          postHingeTurnProgressForFingerX(fingerX, startBookX),
          visualTurnProgressForFingerX(fingerX),
        );
        scheduleOnRN(updateDrag, event.translationX, event.absoluteY, event.velocityX);
      })
      .onEnd((event) => {
        'worklet';
        if (!gestureStarted.value) return;
        const direction = gestureDirection.value;
        const startBookX = gestureStartBookX.value;
        const currentBookX = bookXForGestureTravel(
          startBookX,
          event.translationX,
          direction,
          viewportWidth,
        );
        const fingerX = anchoredGestureFingerX(startBookX, currentBookX);
        gestureProgress.value = Math.max(
          postHingeTurnProgressForFingerX(fingerX, startBookX),
          visualTurnProgressForFingerX(fingerX),
        );
        gestureStarted.value = false;
        gestureDirectionLocked.value = false;
        scheduleOnRN(endDrag, event.velocityX, event.translationX);
      })
      .onFinalize(() => {
        'worklet';
        if (gestureStarted.value) {
          gestureStarted.value = false;
          gestureDirectionLocked.value = false;
          scheduleOnRN(endDrag, 0, 0);
        }
      }),
    [
      beginDrag,
      endDrag,
      gestureDirection,
      gestureDirectionLocked,
      gestureProgress,
      gestureStartBookX,
      gestureStartX,
      gestureStarted,
      isSettling,
      updateDrag,
      viewportWidth,
    ],
  );
  /* eslint-enable react-hooks/refs, react-hooks/immutability */

  const next = useCallback(() => {
    handoffGeneration.current += 1;
    dragState.current = undefined;
    setInteractiveTurn(undefined);
    return runtime.next();
  }, [runtime]);
  const previous = useCallback(() => {
    handoffGeneration.current += 1;
    dragState.current = undefined;
    setInteractiveTurn(undefined);
    return runtime.previous();
  }, [runtime]);

  useEffect(() => () => {
    handoffGeneration.current += 1;
    dragState.current = undefined;
  }, [runtime]);

  return { gesture, interactiveTurn, isSettling, next, previous };
}

function waitForPageTurn(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/** Allow the committed page to reach React's subscriber and the Skia canvas. */
function waitForPageHandoffFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
