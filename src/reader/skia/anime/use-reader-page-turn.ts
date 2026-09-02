import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ReaderSnapshot, ReaderSpreadMode, ReaderViewport } from '../../contracts';
import type {
  LunarReaderRuntime,
  ReaderPreparedTurn,
} from '../../runtime/core/native-reader-runtime';
import { readerDiagnostic } from '../../runtime/core/performance';
import {
  anchoredGestureFingerX,
  bookXForGestureTravel,
  gestureLiftRotationForFingerX,
  gesturePressedChordForFingerX,
  pageTurnStartBookXForTouch,
  pageTurnRenderProgress,
  planarTurnProgressForTranslation,
  shouldCommitPlanarTurn,
} from './page-turn-gesture';
import {
  AUTOMATIC_PAGE_TURN_MAX_LANES,
  AUTOMATIC_PAGE_TURN_START_INTERVAL_MS,
  appendAutomaticPageTurn,
} from './page-turn-concurrency';
import {
  getReaderPageTurnSettleDuration,
  resolveReaderPageAnimationStyle,
} from './page-turn-timing';
import type {
  ReaderAutomaticTurn,
  ReaderInteractiveTurn,
  ReaderPageAnimationStyle,
  ReaderPageContent,
} from './page-transition';

interface ReaderDragState {
  readonly id: number;
  readonly revisionId: number;
  readonly startSpread: number;
  readonly startX: number;
  direction: 1 | -1;
  directionLocked: boolean;
  startBookX: number;
  physicalProgress: number;
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
  preparation?: Promise<ReaderPreparedTurn | undefined>;
  preparedTurn?: ReaderPreparedTurn;
  targetUnavailableLogged?: boolean;
}

interface ReaderCommittedHandoff {
  readonly turnId: number;
  readonly generation: number;
  readonly revisionId: number;
  readonly spreadIndex: number;
  readonly renderId: number;
}

export interface UseReaderPageTurnOptions {
  readonly runtime: LunarReaderRuntime;
  readonly snapshot: ReaderSnapshot;
  readonly viewport?: ReaderViewport;
  readonly animationStyle?: ReaderPageAnimationStyle;
  readonly animationDuration?: number;
  readonly spreadMode?: ReaderSpreadMode;
  /** Vertical viewport offset of the reader surface, used with absolute gesture coordinates. */
  readonly surfaceTop?: number;
}

export interface ReaderPageTurnController {
  readonly gesture: PanGesture;
  readonly interactiveTurn?: ReaderInteractiveTurn;
  readonly automaticTurns: readonly ReaderAutomaticTurn[];
  readonly automaticNavigationActive: boolean;
  readonly isSettling: boolean;
  completeAutomaticTurn(turnId: number): void;
  next(): Promise<ReaderSnapshot>;
  previous(): Promise<ReaderSnapshot>;
}

export function useReaderPageTurn({
  runtime,
  snapshot,
  viewport,
  animationStyle = 'slide',
  animationDuration = 360,
  spreadMode = 'double',
  surfaceTop = 0,
}: UseReaderPageTurnOptions): ReaderPageTurnController {
  const dragState = useRef<ReaderDragState | undefined>(undefined);
  const turnSequence = useRef(0);
  const activeTurnId = useRef<number | undefined>(undefined);
  const handoffGeneration = useRef(0);
  const automaticNavigationGeneration = useRef(0);
  const automaticNavigationQueue = useRef<Promise<void>>(Promise.resolve());
  const automaticNextStartAt = useRef(0);
  const automaticDirection = useRef<1 | -1 | undefined>(undefined);
  const automaticPendingCount = useRef(0);
  const automaticTurnsRef = useRef<readonly ReaderAutomaticTurn[]>([]);
  const controllerRuntime = useRef(runtime);
  const gestureProgress = useSharedValue(0);
  const gestureStarted = useSharedValue(false);
  const gestureDirectionLocked = useSharedValue(false);
  const gestureDirection = useSharedValue<1 | -1>(1);
  const gestureStartX = useSharedValue(0);
  const gestureStartBookX = useSharedValue(1);
  const gestureGrabY = useSharedValue(0);
  const gesturePressedEdgeX = useSharedValue(1);
  const gestureHeldRollTilt = useSharedValue(0);
  const [interactiveTurn, setInteractiveTurn] = useState<ReaderInteractiveTurn>();
  const [committedHandoff, setCommittedHandoff] = useState<ReaderCommittedHandoff>();
  const [automaticTurns, setAutomaticTurns] = useState<readonly ReaderAutomaticTurn[]>([]);
  const [automaticPendingRequests, setAutomaticPendingRequests] = useState(0);
  const isReady = snapshot.phase === 'ready';
  const automaticNavigationActive = automaticPendingRequests > 0 || automaticTurns.length > 0;

  useEffect(() => {
    if (!committedHandoff) return;
    if (handoffGeneration.current !== committedHandoff.generation) return;
    if (
      snapshot.revisionId !== committedHandoff.revisionId
      || snapshot.spreadIndex !== committedHandoff.spreadIndex
      || snapshot.renderId !== committedHandoff.renderId
    ) {
      return;
    }

    readerDiagnostic(
      'turn.handoff.snapshot-ready',
      `turn=${committedHandoff.turnId} ui=${describeSnapshotIdentity(snapshot)} generation=${committedHandoff.generation}`,
    );
    // Keep the completed interactive picture mounted until the subscribed
    // React snapshot identifies the same target. The runtime snapshot may be
    // ahead of its subscriber during a fast release. One additional frame
    // lets the target Canvas tree commit before the interactive layer leaves.
    const frame = requestAnimationFrame(() => {
      if (handoffGeneration.current !== committedHandoff.generation) return;
      readerDiagnostic(
        'turn.handoff.clear',
        `turn=${committedHandoff.turnId} ui=${describeSnapshotIdentity(snapshot)} generation=${committedHandoff.generation}`,
      );
      activeTurnId.current = undefined;
      setCommittedHandoff(undefined);
      setInteractiveTurn(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [committedHandoff, snapshot.renderId, snapshot.revisionId, snapshot.spreadIndex]);

  useEffect(() => {
    if (!interactiveTurn && !committedHandoff) return;
    readerDiagnostic(
      'turn.ui.snapshot',
      [
        `turn=${committedHandoff?.turnId ?? activeTurnId.current ?? 'none'}`,
        `ui=${describeSnapshotIdentity(snapshot)}`,
        `target=${interactiveTurn ? describeSnapshotIdentity(interactiveTurn.content.snapshot) : 'none'}`,
        `settling=${String(interactiveTurn?.settling === true)}`,
        `handoff=${String(Boolean(committedHandoff))}`,
      ].join(' '),
    );
  }, [committedHandoff, interactiveTurn, snapshot.renderId, snapshot.revisionId, snapshot.spreadIndex]);

  const beginDrag = useCallback((startX: number, startY: number) => {
    if (!isReady || !viewport || interactiveTurn?.settling || automaticNavigationActive) return;
    const turnId = ++turnSequence.current;
    activeTurnId.current = turnId;
    handoffGeneration.current += 1;
    dragState.current = {
      id: turnId,
      revisionId: snapshot.revisionId,
      startSpread: snapshot.spreadIndex,
      startX,
      direction: 1,
      directionLocked: false,
      startBookX: 1,
      physicalProgress: 0,
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
    readerDiagnostic(
      'turn.gesture.begin',
      `turn=${turnId} source=${describeSnapshotIdentity(snapshot)} x=${formatTraceNumber(startX)} y=${formatTraceNumber(startY)}`,
    );
  }, [automaticNavigationActive, interactiveTurn?.settling, isReady, snapshot, viewport]);

  const showPreparedTurn = useCallback((
    state: ReaderDragState,
    preparedTurn: ReaderPreparedTurn,
  ): boolean => {
    if (runtime.getSnapshot().revisionId !== preparedTurn.revisionId) {
      readerDiagnostic(
        'turn.target.reject',
        `turn=${state.id} prepared=${preparedTurn.id} reason=revision runtime=${describeSnapshotIdentity(runtime.getSnapshot())} expectedRevision=${preparedTurn.revisionId}`,
      );
      return false;
    }
    state.preparedTurn = preparedTurn;
    const targetPicture = runtime.getCurrentPicture(
      preparedTurn.revisionId,
      preparedTurn.targetSpreadIndex,
      preparedTurn.targetRenderId,
    );
    const targetFrame = runtime.getCurrentFrame(preparedTurn.targetSpreadIndex);
    if (!targetPicture || !targetFrame) {
      if (!state.targetUnavailableLogged) {
        state.targetUnavailableLogged = true;
        readerDiagnostic(
          'turn.target.unavailable',
          `turn=${state.id} prepared=${preparedTurn.id} target=${describePreparedTarget(preparedTurn)} picture=${String(Boolean(targetPicture))} frame=${String(Boolean(targetFrame))}`,
        );
      }
      return false;
    }
    state.preparing = false;
    state.prepared = true;
    readerDiagnostic(
      'turn.target.mount',
      `turn=${state.id} prepared=${preparedTurn.id} sourceSpread=${preparedTurn.sourceSnapshotSpreadIndex} target=${describePreparedTarget(preparedTurn)} progress=${formatTraceNumber(state.renderProgress)}`,
    );
    setInteractiveTurn({
      content: {
        key: `${preparedTurn.revisionId}:${preparedTurn.targetSpreadIndex}:${preparedTurn.targetRenderId}:drag`,
        snapshot: {
          ...snapshot,
          spreadIndex: preparedTurn.targetSpreadIndex,
          renderId: preparedTurn.targetRenderId,
        },
        picture: targetPicture,
        frame: targetFrame,
      } satisfies ReaderPageContent,
      direction: state.direction,
      progress: state.renderProgress,
      progressValue: gestureProgress,
      grabX: state.grabX,
      grabY: state.grabY,
      grabYValue: gestureGrabY,
      pressedEdgeX: state.pressedEdgeX,
      pressedEdgeXValue: gesturePressedEdgeX,
      heldRollTilt: state.heldRollTilt,
      heldRollTiltValue: gestureHeldRollTilt,
      fingerX: state.fingerX,
      throwVelocity: state.throwVelocity,
      throwAcceleration: state.throwAcceleration,
    });
    return true;
  }, [
    gestureGrabY,
    gestureHeldRollTilt,
    gesturePressedEdgeX,
    gestureProgress,
    runtime,
    snapshot,
  ]);

  const updateDrag = useCallback((translationX: number, absoluteY: number, velocityX: number) => {
    const state = dragState.current;
    if (!state || !viewport || !isReady) return;
    if (!state.directionLocked) {
      if (Math.abs(translationX) < 2) return;
      state.direction = translationX < 0 ? 1 : -1;
      state.directionLocked = true;
      readerDiagnostic(
        'turn.gesture.direction',
        `turn=${state.id} direction=${state.direction > 0 ? 'next' : 'previous'} translationX=${formatTraceNumber(translationX)}`,
      );
    }

    const direction = state.direction;
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
    state.physicalProgress = planarTurnProgressForTranslation(translationX, viewport.width);
    state.renderProgress = pageTurnRenderProgress(
      state.physicalProgress,
      direction,
      spreadMode,
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

    if (state.preparedTurn && !state.prepared) {
      showPreparedTurn(state, state.preparedTurn);
      return;
    }

    if (!state.preparing && !state.prepared) {
      state.preparing = true;
      const turnDirection = direction > 0 ? 'next' : 'previous';
      readerDiagnostic(
        'turn.prepare.begin',
        `turn=${state.id} direction=${turnDirection} sourceRevision=${state.revisionId} sourceSpread=${state.startSpread}`,
      );
      const preparation = runtime.prepareAdjacent(turnDirection);
      state.preparation = preparation;
      void preparation.then((preparedTurn) => {
        const current = dragState.current;
        if (
          !current
          || current !== state
          || current.revisionId !== state.revisionId
          || current.direction !== direction
          || runtime.getSnapshot().revisionId !== state.revisionId
        ) {
          readerDiagnostic(
            'turn.prepare.stale',
            `turn=${state.id} prepared=${preparedTurn?.id ?? 'none'} activeTurn=${current?.id ?? 'none'} runtime=${describeSnapshotIdentity(runtime.getSnapshot())}`,
          );
          if (preparedTurn) void runtime.cancelPreparedTurn(preparedTurn);
          return;
        }
        current.preparation = undefined;
        if (preparedTurn) current.preparedTurn = preparedTurn;
        readerDiagnostic(
          preparedTurn ? 'turn.prepare.ready' : 'turn.prepare.empty',
          preparedTurn
            ? `turn=${state.id} prepared=${preparedTurn.id} target=${describePreparedTarget(preparedTurn)}`
            : `turn=${state.id} direction=${turnDirection} runtime=${describeSnapshotIdentity(runtime.getSnapshot())}`,
        );
        if (!preparedTurn || !showPreparedTurn(current, preparedTurn)) {
          current.preparing = false;
        }
      });
    }
  }, [
    gestureGrabY,
    gestureHeldRollTilt,
    gesturePressedEdgeX,
    gestureProgress,
    isReady,
    runtime,
    showPreparedTurn,
    snapshot,
    spreadMode,
    surfaceTop,
    viewport,
  ]);

  const finishDrag = useCallback((
    state: ReaderDragState,
    releaseVelocity = 0,
    releaseTranslationX = 0,
  ) => {
    if (dragState.current === state) dragState.current = undefined;
    if (!state.directionLocked) {
      readerDiagnostic('turn.gesture.end', `turn=${state.id} decision=none reason=direction-unlocked`);
      activeTurnId.current = undefined;
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
      state.physicalProgress = planarTurnProgressForTranslation(
        releaseTranslationX,
        viewport.width,
      );
      state.renderProgress = pageTurnRenderProgress(
        state.physicalProgress,
        state.direction,
        spreadMode,
      );
    }

    const terminalThrowVelocity = viewport
      ? Math.max(
          0,
          (state.direction === 1 ? -releaseVelocity : releaseVelocity) / Math.max(1, viewport.width),
        )
      : 0;
    const throwVelocity = Math.max(state.throwVelocity, terminalThrowVelocity);
    const towardTargetVelocity = viewport
      ? (state.direction === 1 ? -releaseVelocity : releaseVelocity) / Math.max(1, viewport.width)
      : 0;
    const commit = shouldCommitPlanarTurn(state.physicalProgress, towardTargetVelocity);
    readerDiagnostic(
      'turn.release',
      [
        `turn=${state.id}`,
        `direction=${state.direction > 0 ? 'next' : 'previous'}`,
        `decision=${commit ? 'commit' : 'cancel'}`,
        `physicalProgress=${formatTraceNumber(state.physicalProgress)}`,
        `renderProgress=${formatTraceNumber(state.renderProgress)}`,
        `velocity=${formatTraceNumber(towardTargetVelocity)}`,
        `prepared=${String(state.prepared)}`,
        `preparedId=${state.preparedTurn?.id ?? 'none'}`,
      ].join(' '),
    );
    if (!commit) {
      if (!state.prepared) {
        if (state.preparedTurn) void runtime.cancelPreparedTurn(state.preparedTurn);
        readerDiagnostic(
          'turn.cancel.clear',
          `turn=${state.id} mode=without-mounted-target prepared=${state.preparedTurn?.id ?? 'none'}`,
        );
        activeTurnId.current = undefined;
        setInteractiveTurn(undefined);
        return;
      }
      const settleDuration = getReaderPageTurnSettleDuration(
        animationStyle,
        state.renderProgress,
        0,
        towardTargetVelocity,
        animationDuration,
      );
      const generation = ++handoffGeneration.current;
      const preparedTurn = state.preparedTurn;
      let notifyVisualSettle: () => void = () => undefined;
      const visualSettle = new Promise<void>((resolve) => {
        notifyVisualSettle = resolve;
      });
      readerDiagnostic(
        'turn.cancel.begin',
        `turn=${state.id} prepared=${preparedTurn?.id ?? 'none'} durationMs=${settleDuration}`,
      );
      setInteractiveTurn((turn) => turn ? {
        ...turn,
        progress: state.renderProgress,
        progressValue: gestureProgress,
        grabY: state.grabY,
        grabYValue: gestureGrabY,
        pressedEdgeX: state.pressedEdgeX,
        pressedEdgeXValue: gesturePressedEdgeX,
        heldRollTilt: state.heldRollTilt,
        heldRollTiltValue: gestureHeldRollTilt,
        releaseVelocity: towardTargetVelocity,
        settling: true,
        settleTo: 0,
        onSettleComplete: notifyVisualSettle,
      } : turn);
      void Promise.race([
        visualSettle,
        waitForPageTurn(settleDuration + PAGE_TURN_SETTLE_FALLBACK_DELAY_MS),
      ])
        .then(() => {
          readerDiagnostic(
            'turn.cancel.visual-ready',
            `turn=${state.id} prepared=${preparedTurn?.id ?? 'none'} generation=${generation}`,
          );
          return preparedTurn
            ? runtime.cancelPreparedTurn(preparedTurn)
            : Promise.resolve();
        })
        .catch(() => undefined)
        .then(waitForPageHandoffFrames)
        .then(() => {
          if (handoffGeneration.current !== generation) return;
          readerDiagnostic(
            'turn.cancel.clear',
            `turn=${state.id} runtime=${describeSnapshotIdentity(runtime.getSnapshot())} generation=${generation}`,
          );
          activeTurnId.current = undefined;
          setInteractiveTurn(undefined);
        });
      return;
    }

    const preparedTurn = state.preparedTurn;
    if (!state.prepared || !preparedTurn) {
      readerDiagnostic(
        'turn.commit.fallback',
        `turn=${state.id} prepared=${preparedTurn?.id ?? 'none'} mounted=${String(state.prepared)} direction=${state.direction > 0 ? 'next' : 'previous'}`,
      );
      setInteractiveTurn(undefined);
      void (preparedTurn
        ? runtime.commitPreparedTurn(preparedTurn)
        : state.direction > 0
          ? runtime.next()
          : runtime.previous()).then((result) => {
            readerDiagnostic(
              'turn.commit.fallback-ready',
              `turn=${state.id} result=${describeSnapshotIdentity(result)}`,
            );
            activeTurnId.current = undefined;
          });
      return;
    }

    setInteractiveTurn((turn) => turn ? {
      ...turn,
      progress: state.renderProgress,
      progressValue: gestureProgress,
      pressedEdgeX: state.pressedEdgeX,
      heldRollTilt: state.heldRollTilt,
      fingerX: state.fingerX,
      releaseVelocity: towardTargetVelocity,
      throwVelocity,
      settling: true,
      settleTo: 1,
    } : turn);
    const navigate = runtime.commitPreparedTurn(preparedTurn);
    const settleDuration = getReaderPageTurnSettleDuration(
      animationStyle,
      state.renderProgress,
      1,
      towardTargetVelocity,
      animationDuration,
    );
    const generation = ++handoffGeneration.current;
    readerDiagnostic(
      'turn.commit.begin',
      `turn=${state.id} prepared=${preparedTurn.id} target=${describePreparedTarget(preparedTurn)} durationMs=${settleDuration} generation=${generation}`,
    );
    void Promise.allSettled([navigate, waitForPageTurn(settleDuration)]).then(() => {
      if (handoffGeneration.current !== generation) return;
      const currentSnapshot = runtime.getSnapshot();
      if (
        currentSnapshot.revisionId !== preparedTurn.revisionId
        || currentSnapshot.spreadIndex !== preparedTurn.targetSpreadIndex
        || currentSnapshot.renderId !== preparedTurn.targetRenderId
      ) {
        readerDiagnostic(
          'turn.commit.mismatch',
          `turn=${state.id} prepared=${preparedTurn.id} expected=${describePreparedTarget(preparedTurn)} runtime=${describeSnapshotIdentity(currentSnapshot)}`,
        );
        activeTurnId.current = undefined;
        setInteractiveTurn(undefined);
        return;
      }
      readerDiagnostic(
        'turn.commit.runtime-ready',
        `turn=${state.id} prepared=${preparedTurn.id} runtime=${describeSnapshotIdentity(currentSnapshot)} generation=${generation}`,
      );
      setCommittedHandoff({
        turnId: state.id,
        generation,
        revisionId: preparedTurn.revisionId,
        spreadIndex: preparedTurn.targetSpreadIndex,
        renderId: preparedTurn.targetRenderId,
      });
    });
  }, [
    animationDuration,
    animationStyle,
    gestureGrabY,
    gestureHeldRollTilt,
    gesturePressedEdgeX,
    gestureProgress,
    runtime,
    spreadMode,
    viewport,
  ]);

  const endDrag = useCallback((releaseVelocity = 0, releaseTranslationX = 0) => {
    if (interactiveTurn?.settling) return;
    const state = dragState.current;
    if (!state) return;
    if (state.preparation && !state.preparedTurn) {
      const preparation = state.preparation;
      readerDiagnostic(
        'turn.release.wait-prepare',
        `turn=${state.id} translationX=${formatTraceNumber(releaseTranslationX)} velocityX=${formatTraceNumber(releaseVelocity)}`,
      );
      void preparation.then(() => {
        if (dragState.current === state) {
          finishDrag(state, releaseVelocity, releaseTranslationX);
        }
      });
      return;
    }
    finishDrag(state, releaseVelocity, releaseTranslationX);
  }, [finishDrag, interactiveTurn?.settling]);

  /* eslint-disable react-hooks/refs, react-hooks/immutability */
  const viewportWidth = viewport?.width ?? 1;
  const viewportHeight = viewport?.height ?? 1;
  const isSettling = interactiveTurn?.settling === true;
  const gestureBlocked = isSettling || automaticNavigationActive;
  const gesture = useMemo(
    () => Gesture.Pan()
      .minDistance(2)
      .onBegin((event) => {
        'worklet';
        if (gestureBlocked) {
          gestureStarted.value = false;
          return;
        }
        gestureStarted.value = true;
        gestureDirectionLocked.value = false;
        gestureDirection.value = 1;
        gestureStartX.value = event.x;
        gestureStartBookX.value = 1;
        gestureProgress.value = 0;
        gestureGrabY.value = event.y;
        gesturePressedEdgeX.value = 1;
        gestureHeldRollTilt.value = 0;
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
        const heldRollTilt = gestureLiftRotationForFingerX(fingerX);
        gestureProgress.value = pageTurnRenderProgress(
          planarTurnProgressForTranslation(event.translationX, viewportWidth),
          direction,
          spreadMode,
        );
        gestureGrabY.value = Math.min(
          viewportHeight,
          Math.max(0, event.absoluteY - surfaceTop),
        );
        gestureHeldRollTilt.value = heldRollTilt;
        gesturePressedEdgeX.value = gesturePressedChordForFingerX(fingerX, heldRollTilt);
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
        const heldRollTilt = gestureLiftRotationForFingerX(fingerX);
        gestureProgress.value = pageTurnRenderProgress(
          planarTurnProgressForTranslation(event.translationX, viewportWidth),
          direction,
          spreadMode,
        );
        gestureGrabY.value = Math.min(
          viewportHeight,
          Math.max(0, event.absoluteY - surfaceTop),
        );
        gestureHeldRollTilt.value = heldRollTilt;
        gesturePressedEdgeX.value = gesturePressedChordForFingerX(fingerX, heldRollTilt);
        gestureStarted.value = false;
        gestureDirectionLocked.value = false;
        scheduleOnRN(endDrag, event.velocityX, event.translationX);
      })
      .onFinalize(() => {
        'worklet';
        if (gestureStarted.value) {
          gestureStarted.value = false;
          gestureDirectionLocked.value = false;
          scheduleOnRN(endDrag, 0, Number.NaN);
        }
      }),
    [
      beginDrag,
      endDrag,
      gestureDirection,
      gestureDirectionLocked,
      gestureGrabY,
      gestureHeldRollTilt,
      gesturePressedEdgeX,
      gestureProgress,
      gestureStartBookX,
      gestureStartX,
      gestureStarted,
      gestureBlocked,
      spreadMode,
      surfaceTop,
      updateDrag,
      viewportHeight,
      viewportWidth,
    ],
  );
  /* eslint-enable react-hooks/refs, react-hooks/immutability */

  const completeAutomaticTurn = useCallback((turnId: number) => {
    const nextTurns = automaticTurnsRef.current.filter((turn) => turn.id !== turnId);
    if (nextTurns.length === automaticTurnsRef.current.length) return;
    automaticTurnsRef.current = nextTurns;
    setAutomaticTurns(nextTurns);
    if (nextTurns.length === 0 && automaticPendingCount.current === 0) {
      automaticDirection.current = undefined;
    }
  }, []);

  const enqueueAutomaticNavigation = useCallback((direction: 1 | -1) => {
    const paperAnimation = resolveReaderPageAnimationStyle(animationStyle) === 'page';
    if (paperAnimation) {
      if (
        automaticDirection.current !== undefined
        && automaticDirection.current !== direction
      ) {
        return Promise.resolve(runtime.getSnapshot());
      }
      if (
        automaticPendingCount.current + automaticTurnsRef.current.length
        >= AUTOMATIC_PAGE_TURN_MAX_LANES
      ) {
        return Promise.resolve(runtime.getSnapshot());
      }
      automaticDirection.current = direction;
      automaticPendingCount.current += 1;
      setAutomaticPendingRequests(automaticPendingCount.current);
    }
    const generation = automaticNavigationGeneration.current;
    return new Promise<ReaderSnapshot>((resolve, reject) => {
      const run = async () => {
        try {
          if (automaticNavigationGeneration.current !== generation) {
            resolve(runtime.getSnapshot());
            return;
          }
          if (paperAnimation) {
            const startDelay = Math.max(0, automaticNextStartAt.current - Date.now());
            if (startDelay > 0) await waitForPageTurn(startDelay);
            if (automaticNavigationGeneration.current !== generation) {
              resolve(runtime.getSnapshot());
              return;
            }
          }
          handoffGeneration.current += 1;
          const preparedTurn = dragState.current?.preparedTurn;
          dragState.current = undefined;
          activeTurnId.current = undefined;
          setCommittedHandoff(undefined);
          setInteractiveTurn(undefined);
          if (preparedTurn) await runtime.cancelPreparedTurn(preparedTurn);
          const before = runtime.getSnapshot();
          const from = paperAnimation
            ? readerPageContentForSnapshot(runtime, before)
            : undefined;
          const result = direction > 0 ? await runtime.next() : await runtime.previous();
          if (
            paperAnimation
            && automaticNavigationGeneration.current === generation
            && from
            && !sameSnapshotIdentity(before, result)
          ) {
            const to = readerPageContentForSnapshot(runtime, result);
            if (to) {
              const turn: ReaderAutomaticTurn = {
                id: ++turnSequence.current,
                from,
                to,
                direction,
              };
              const nextTurns = appendAutomaticPageTurn(
                automaticTurnsRef.current,
                turn,
              );
              automaticTurnsRef.current = nextTurns;
              setAutomaticTurns(nextTurns);
              automaticNextStartAt.current = Date.now()
                + AUTOMATIC_PAGE_TURN_START_INTERVAL_MS;
            }
          }
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          if (paperAnimation) {
            automaticPendingCount.current = Math.max(
              0,
              automaticPendingCount.current - 1,
            );
            setAutomaticPendingRequests(automaticPendingCount.current);
            if (
              automaticPendingCount.current === 0
              && automaticTurnsRef.current.length === 0
            ) {
              automaticDirection.current = undefined;
            }
          }
        }
      };
      automaticNavigationQueue.current = automaticNavigationQueue.current.then(run, run);
    });
  }, [animationStyle, runtime]);
  const next = useCallback(
    () => enqueueAutomaticNavigation(1),
    [enqueueAutomaticNavigation],
  );
  const previous = useCallback(
    () => enqueueAutomaticNavigation(-1),
    [enqueueAutomaticNavigation],
  );

  useEffect(() => {
    const runtimeChanged = controllerRuntime.current !== runtime;
    controllerRuntime.current = runtime;
    automaticNavigationGeneration.current += 1;
    automaticNavigationQueue.current = Promise.resolve();
    automaticNextStartAt.current = 0;
    automaticDirection.current = undefined;
    automaticPendingCount.current = 0;
    automaticTurnsRef.current = [];
    if (runtimeChanged) {
      void Promise.resolve().then(() => {
        if (controllerRuntime.current !== runtime) return;
        setAutomaticPendingRequests(0);
        setAutomaticTurns([]);
      });
    }
    return () => {
      automaticNavigationGeneration.current += 1;
      handoffGeneration.current += 1;
      const preparedTurn = dragState.current?.preparedTurn;
      dragState.current = undefined;
      if (preparedTurn) void runtime.cancelPreparedTurn(preparedTurn);
    };
  }, [runtime]);

  return {
    gesture,
    interactiveTurn,
    automaticTurns,
    automaticNavigationActive,
    isSettling,
    completeAutomaticTurn,
    next,
    previous,
  };
}

function waitForPageTurn(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

const PAGE_TURN_SETTLE_FALLBACK_DELAY_MS = 180;

/** Allow the committed page to reach React's subscriber and the Skia canvas. */
function waitForPageHandoffFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function describeSnapshotIdentity(snapshot: Pick<ReaderSnapshot, 'revisionId' | 'spreadIndex' | 'renderId'>): string {
  return `${snapshot.revisionId}:${snapshot.spreadIndex}:${snapshot.renderId ?? 'none'}`;
}

function sameSnapshotIdentity(
  first: Pick<ReaderSnapshot, 'revisionId' | 'spreadIndex' | 'renderId'>,
  second: Pick<ReaderSnapshot, 'revisionId' | 'spreadIndex' | 'renderId'>,
): boolean {
  return first.revisionId === second.revisionId
    && first.spreadIndex === second.spreadIndex
    && first.renderId === second.renderId;
}

function readerPageContentForSnapshot(
  runtime: LunarReaderRuntime,
  snapshot: ReaderSnapshot,
): ReaderPageContent | undefined {
  if (snapshot.phase !== 'ready') return undefined;
  const picture = runtime.getCurrentPicture(
    snapshot.revisionId,
    snapshot.spreadIndex,
    snapshot.renderId,
  );
  const frame = runtime.getCurrentFrame(snapshot.spreadIndex);
  if (!picture || !frame) return undefined;
  return {
    key: describeSnapshotIdentity(snapshot),
    snapshot,
    picture,
    frame,
  };
}

function describePreparedTarget(preparedTurn: ReaderPreparedTurn): string {
  return `${preparedTurn.revisionId}:${preparedTurn.targetSpreadIndex}:${preparedTurn.targetRenderId}`;
}

function formatTraceNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : String(value);
}
