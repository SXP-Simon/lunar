import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';

import type { ReaderSpreadMode, ReaderViewport } from '../../../contracts';
import type { LunarReaderRuntime } from '../../../runtime/core/native-reader-runtime';
import { readerDiagnostic } from '../../../runtime/core/performance';
import {
  describePreparedTarget,
  describeSnapshotIdentity,
  formatTraceNumber,
} from '../core/page-content';
import type { ReaderInteractiveTurn, ReaderPageAnimationStyle } from '../core/page-turn-types';
import { getReaderPageTurnSettleDuration } from '../core/page-turn-timing';
import {
  anchoredGestureFingerX,
  bookXForGestureTravel,
  gestureLiftRotationForFingerX,
  gesturePressedChordForFingerX,
  pageTurnRenderProgress,
  planarTurnProgressForTranslation,
  shouldCommitPlanarTurn,
} from '../gesture/page-turn-gesture';
import type { PageTurnGestureValues } from '../gesture/use-page-turn-pan-gesture';
import type {
  ReaderCommittedHandoff,
  ReaderDragState,
  ReaderNativeGestureHandoff,
} from './interactive-page-turn-state';

const PAGE_TURN_SETTLE_FALLBACK_DELAY_MS = 180;

interface PageTurnReleaseOptions {
  readonly activeTurnIdRef: RefObject<number | undefined>;
  readonly animationDuration: number;
  readonly animationStyle: ReaderPageAnimationStyle;
  readonly dragStateRef: RefObject<ReaderDragState | undefined>;
  readonly gestureValues: PageTurnGestureValues;
  readonly handoffGenerationRef: RefObject<number>;
  readonly interactiveTurn?: ReaderInteractiveTurn;
  readonly nativeGestureHandoffRef: RefObject<ReaderNativeGestureHandoff | undefined>;
  readonly runtime: LunarReaderRuntime;
  readonly setCommittedHandoff: Dispatch<SetStateAction<ReaderCommittedHandoff | undefined>>;
  readonly setInteractiveTurn: Dispatch<SetStateAction<ReaderInteractiveTurn | undefined>>;
  readonly spreadMode: ReaderSpreadMode;
  readonly viewport?: ReaderViewport;
}

export function usePageTurnRelease({
  activeTurnIdRef,
  animationDuration,
  animationStyle,
  dragStateRef,
  gestureValues,
  handoffGenerationRef,
  interactiveTurn,
  nativeGestureHandoffRef,
  runtime,
  setCommittedHandoff,
  setInteractiveTurn,
  spreadMode,
  viewport,
}: PageTurnReleaseOptions): (
  releaseVelocity?: number,
  releaseTranslationX?: number,
  nativeReleased?: boolean,
) => void {
  const finishDrag = useCallback((
    state: ReaderDragState,
    releaseVelocity = 0,
    releaseTranslationX = 0,
    nativeReleased = false,
  ) => {
    if (dragStateRef.current === state) dragStateRef.current = undefined;
    if (
      !nativeReleased
      && nativeGestureHandoffRef.current?.gestureToken === state.nativeGestureToken
    ) {
      nativeGestureHandoffRef.current = undefined;
    }
    if (!state.directionLocked) {
      readerDiagnostic('turn.gesture.end', `turn=${state.id} decision=none reason=direction-unlocked`);
      activeTurnIdRef.current = undefined;
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
          (state.direction === 1 ? -releaseVelocity : releaseVelocity)
            / Math.max(1, viewport.width),
        )
      : 0;
    const throwVelocity = Math.max(state.throwVelocity, terminalThrowVelocity);
    const towardTargetVelocity = viewport
      ? (state.direction === 1 ? -releaseVelocity : releaseVelocity)
        / Math.max(1, viewport.width)
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
    if (nativeReleased && state.preparedTurn && state.prepared) {
      const existingHandoff = nativeGestureHandoffRef.current;
      const generation = existingHandoff?.gestureToken === state.nativeGestureToken
        ? existingHandoff.generation
        : ++handoffGenerationRef.current;
      if (existingHandoff?.gestureToken !== state.nativeGestureToken) {
        nativeGestureHandoffRef.current = {
          gestureToken: state.nativeGestureToken,
          preparedTurn: state.preparedTurn,
          generation,
          terminalEventHandled: false,
        };
      }
      setInteractiveTurn((turn) => turn ? {
        ...turn,
        progress: state.renderProgress,
        progressValue: gestureValues.progress,
        pressedEdgeX: state.pressedEdgeX,
        heldRollTilt: state.heldRollTilt,
        fingerX: state.fingerX,
        releaseVelocity: towardTargetVelocity,
        throwVelocity,
        settling: true,
        settleTo: commit ? 1 : 0,
        nativeGesture: turn.nativeGesture ? {
          ...turn.nativeGesture,
          driven: true,
          settling: true,
        } : undefined,
      } : turn);
      readerDiagnostic(
        'turn.native.release',
        `turn=${state.id} prepared=${state.preparedTurn.id} expected=${commit ? 'commit' : 'cancel'} generation=${generation}`,
      );
      return;
    }
    if (!commit) {
      if (!state.prepared) {
        if (state.preparedTurn) void runtime.cancelPreparedTurn(state.preparedTurn);
        readerDiagnostic(
          'turn.cancel.clear',
          `turn=${state.id} mode=without-mounted-target prepared=${state.preparedTurn?.id ?? 'none'}`,
        );
        activeTurnIdRef.current = undefined;
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
      const generation = ++handoffGenerationRef.current;
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
        progressValue: gestureValues.progress,
        grabY: state.grabY,
        grabYValue: gestureValues.grabY,
        pressedEdgeX: state.pressedEdgeX,
        pressedEdgeXValue: gestureValues.pressedEdgeX,
        heldRollTilt: state.heldRollTilt,
        heldRollTiltValue: gestureValues.heldRollTilt,
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
          if (handoffGenerationRef.current !== generation) return;
          readerDiagnostic(
            'turn.cancel.clear',
            `turn=${state.id} runtime=${describeSnapshotIdentity(runtime.getSnapshot())} generation=${generation}`,
          );
          activeTurnIdRef.current = undefined;
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
            activeTurnIdRef.current = undefined;
          });
      return;
    }

    setInteractiveTurn((turn) => turn ? {
      ...turn,
      progress: state.renderProgress,
      progressValue: gestureValues.progress,
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
    const generation = ++handoffGenerationRef.current;
    readerDiagnostic(
      'turn.commit.begin',
      `turn=${state.id} prepared=${preparedTurn.id} target=${describePreparedTarget(preparedTurn)} durationMs=${settleDuration} generation=${generation}`,
    );
    void Promise.allSettled([navigate, waitForPageTurn(settleDuration)]).then(() => {
      if (handoffGenerationRef.current !== generation) return;
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
        activeTurnIdRef.current = undefined;
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
    activeTurnIdRef,
    animationDuration,
    animationStyle,
    dragStateRef,
    gestureValues,
    handoffGenerationRef,
    nativeGestureHandoffRef,
    runtime,
    setCommittedHandoff,
    setInteractiveTurn,
    spreadMode,
    viewport,
  ]);

  return useCallback((
    releaseVelocity = 0,
    releaseTranslationX = 0,
    nativeReleased = false,
  ) => {
    if (interactiveTurn?.settling) return;
    const state = dragStateRef.current;
    if (!state) return;
    if (state.preparation && !state.preparedTurn) {
      const preparation = state.preparation;
      readerDiagnostic(
        'turn.release.wait-prepare',
        `turn=${state.id} translationX=${formatTraceNumber(releaseTranslationX)} velocityX=${formatTraceNumber(releaseVelocity)}`,
      );
      void preparation.then(() => {
        if (dragStateRef.current === state) {
          finishDrag(state, releaseVelocity, releaseTranslationX, nativeReleased);
        }
      });
      return;
    }
    finishDrag(state, releaseVelocity, releaseTranslationX, nativeReleased);
  }, [dragStateRef, finishDrag, interactiveTurn?.settling]);
}

function waitForPageTurn(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function waitForPageHandoffFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
