import type { CanvasRef, SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import {
  AUTOMATIC_PAGE_TURN_START_INTERVAL_MS,
} from './page-turn-concurrency';
import {
  nativeAutomaticPageTurnFaces,
  nativeAutomaticPageTurnId,
  nativeInteractivePageTurnStockId,
  readerAutomaticPageTurnId,
} from './native-page-turn';
import { getReaderPageTurnDuration } from './page-turn-timing';
import type {
  ReaderAutomaticTurn,
  ReaderInteractiveTurn,
  ReaderPageContent,
} from './page-transition';
import type { ReaderPageTurnSurfaceBinding } from './use-reader-page-turn';
import {
  configureNativePagerInput,
  configureNativePagerMotion,
  enqueueNativePagerPictureTurn,
  nativePagerCanvasReady,
  nativePagerCompositorAvailable,
  resetNativePagerCompositor,
  setNativePagerAnchor,
  stockNativePagerPicture,
  takeNativePagerEvents,
  type NativePagerMotionTuning,
} from './native-pager-compositor';

const AUTOMATIC_FORWARD_TUNING: NativePagerMotionTuning = {
  releaseX: 0.9,
  liftVelocity: 0.5,
  liftToLeft: 4,
  curvatureRelaxation: 10,
};

const AUTOMATIC_BACKWARD_TUNING: NativePagerMotionTuning = {
  releaseX: 0.4,
  liftVelocity: 0.5,
  liftToLeft: 4,
  curvatureRelaxation: 10,
  incomingLandingStartProgress: 0.15,
  incomingRevealStartProgress: 0,
  incomingRevealEndProgress: 0.18,
  incomingDragProgressScale: 1,
  incomingDragProgressExponent: 1,
  incomingSettleDurationSeconds: 0.7,
  incomingSettleEasingPower: 3,
  incomingRevertDurationSeconds: 0.72,
};

const NATIVE_MOTION_CONFIG = {
  automatic: {
    forward: AUTOMATIC_FORWARD_TUNING,
    backward: AUTOMATIC_BACKWARD_TUNING,
  },
  rapid: {
    forward: AUTOMATIC_FORWARD_TUNING,
    backward: AUTOMATIC_BACKWARD_TUNING,
  },
  gesture: {
    forward: AUTOMATIC_FORWARD_TUNING,
    backward: AUTOMATIC_BACKWARD_TUNING,
  },
} as const;

interface NativeAutomaticPageTurnsOptions {
  readonly canvasRef: RefObject<CanvasRef | null>;
  readonly enabled: boolean;
  readonly turns: readonly ReaderAutomaticTurn[];
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly paperColor: number;
  readonly createPicture: (content: ReaderPageContent) => SkPicture;
  readonly onComplete?: (turnId: number) => void;
  readonly currentContent?: ReaderPageContent;
  readonly interactiveSource?: ReaderPageContent;
  readonly interactiveTurn?: ReaderInteractiveTurn;
  readonly surfaceBinding?: ReaderPageTurnSurfaceBinding;
}

interface NativeAutomaticPageTurnsState {
  readonly enabled: boolean;
  readonly hasPresentedTurn: boolean;
}

export function useNativeAutomaticPageTurns({
  canvasRef,
  enabled,
  turns,
  pixelWidth,
  pixelHeight,
  paperColor,
  createPicture,
  onComplete,
  currentContent,
  interactiveSource,
  interactiveTurn,
  surfaceBinding,
}: NativeAutomaticPageTurnsOptions): NativeAutomaticPageTurnsState {
  const supported = useMemo(
    () => enabled && nativePagerCompositorAvailable(),
    [enabled],
  );
  const [ready, setReady] = useState(false);
  const active = supported && ready;
  const automaticActive = active && onComplete !== undefined;
  const submittedTurnIds = useRef(new Set<number>());
  const presentedTurnIds = useRef(new Set<number>());
  const submittedGestureStockIds = useRef(new Set<string>());
  const anchorKey = useRef<string | undefined>(undefined);
  const [presentedTurnCount, setPresentedTurnCount] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const surfaceBindingRef = useRef(surfaceBinding);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    surfaceBindingRef.current = surfaceBinding;
  }, [surfaceBinding]);

  useEffect(() => {
    const liveTurnIds = new Set(turns.map((turn) => turn.id));
    const presented = presentedTurnIds.current;
    let changed = false;
    for (const turnId of presented) {
      if (!liveTurnIds.has(turnId)) {
        presented.delete(turnId);
        changed = true;
      }
    }
    if (changed) setPresentedTurnCount(presented.size);
  }, [turns]);

  useEffect(() => {
    if (!supported || ready || turns.length > 0) return;
    let cancelled = false;
    let frame = 0;
    const probe = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (
        canvas
        && nativePagerCanvasReady(canvas)
        && configureNativePagerMotion(canvas, NATIVE_MOTION_CONFIG)
      ) {
        setReady(true);
        return;
      }
      frame = requestAnimationFrame(probe);
    };
    probe();
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [canvasRef, ready, supported, turns.length]);

  useEffect(() => {
    if (!active) {
      surfaceBinding?.nativeId.set(-1);
      surfaceBinding?.inputReady.set(false);
      surfaceBinding?.stockedGestureToken.set(0);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const submitted = submittedTurnIds.current;
    const presented = presentedTurnIds.current;
    const submittedGestureStocks = submittedGestureStockIds.current;
    const nativeId = canvas.getNativeId();
    const inputReady = surfaceBinding
      ? configureNativePagerInput(canvas, true)
      : false;
    surfaceBinding?.nativeId.set(nativeId);
    surfaceBinding?.inputReady.set(inputReady);
    return () => {
      configureNativePagerInput(canvas, false);
      resetNativePagerCompositor(canvas);
      submitted.clear();
      submittedGestureStocks.clear();
      anchorKey.current = undefined;
      surfaceBinding?.nativeId.set(-1);
      surfaceBinding?.inputReady.set(false);
      surfaceBinding?.stockedGestureToken.set(0);
      if (presented.size > 0) {
        presented.clear();
        setPresentedTurnCount(0);
      }
    };
  }, [active, canvasRef, surfaceBinding]);

  useEffect(() => {
    if (!active || !surfaceBinding || turns.length > 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const source = interactiveSource ?? currentContent;
    if (!source || interactiveTurn?.nativeGesture?.driven) return;
    if (anchorKey.current === source.key) return;
    if (!setNativePagerAnchor(canvas, source.key)) {
      surfaceBinding.inputReady.set(false);
      return;
    }
    surfaceBinding.inputReady.set(configureNativePagerInput(canvas, true));
    anchorKey.current = source.key;
    submittedGestureStockIds.current.clear();
    surfaceBinding.stockedGestureToken.set(0);
  }, [
    active,
    canvasRef,
    currentContent,
    interactiveSource,
    interactiveTurn?.nativeGesture?.driven,
    surfaceBinding,
    turns.length,
  ]);

  useEffect(() => {
    const nativeGesture = interactiveTurn?.nativeGesture;
    if (
      !active
      || !surfaceBinding
      || !nativeGesture
      || nativeGesture.driven
      || !interactiveSource
      || pixelWidth <= 0
      || pixelHeight <= 0
    ) {
      if (!interactiveTurn) surfaceBinding?.stockedGestureToken.set(0);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || anchorKey.current !== interactiveSource.key) return;
    const stockId = nativeInteractivePageTurnStockId(
      nativeGesture.token,
      nativeGesture.preparedTurnId,
    );
    if (submittedGestureStockIds.current.has(stockId)) {
      surfaceBinding.stockedGestureToken.set(nativeGesture.token);
      return;
    }

    let sourcePicture: SkPicture | undefined;
    let targetPicture: SkPicture | undefined;
    let accepted = false;
    try {
      sourcePicture = createPicture(interactiveSource);
      targetPicture = createPicture(interactiveTurn.content);
      const forward = interactiveTurn.direction > 0;
      accepted = stockNativePagerPicture(canvas, {
        id: stockId,
        fromPageKey: interactiveSource.key,
        toPageKey: interactiveTurn.content.key,
        frontPageKey: forward ? interactiveSource.key : interactiveTurn.content.key,
        backPageKey: forward ? undefined : interactiveSource.key,
        backgroundLeftPageKey: forward
          ? interactiveTurn.content.key
          : interactiveSource.key,
        frontPicture: forward ? sourcePicture : targetPicture,
        backPicture: forward ? undefined : sourcePicture,
        backgroundLeftPicture: forward ? targetPicture : sourcePicture,
        pixelWidth,
        pixelHeight,
        direction: interactiveTurn.direction,
        spread: false,
        contentRevision: interactiveTurn.content.snapshot.revisionId,
        durationMs: getReaderPageTurnDuration(
          'page',
          0,
          undefined,
          interactiveTurn.direction < 0,
        ),
        rapidDurationMs: getReaderPageTurnDuration('page'),
        launchIntervalMs: AUTOMATIC_PAGE_TURN_START_INTERVAL_MS,
        paperColor,
      });
    } catch {
      accepted = false;
    } finally {
      sourcePicture?.dispose();
      targetPicture?.dispose();
    }
    if (!accepted) {
      surfaceBinding.inputReady.set(false);
      return;
    }
    submittedGestureStockIds.current.add(stockId);
    surfaceBinding.stockedGestureToken.set(nativeGesture.token);
  }, [
    active,
    canvasRef,
    createPicture,
    interactiveSource,
    interactiveTurn,
    paperColor,
    pixelHeight,
    pixelWidth,
    surfaceBinding,
  ]);

  useEffect(() => {
    if (!automaticActive || turns.length === 0 || pixelWidth <= 0 || pixelHeight <= 0) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    for (const turn of turns) {
      if (submittedTurnIds.current.has(turn.id)) continue;
      const faces = nativeAutomaticPageTurnFaces(turn);
      let frontPicture: SkPicture | undefined;
      let backgroundPicture: SkPicture | undefined;
      let accepted = false;
      try {
        frontPicture = createPicture(faces.front);
        backgroundPicture = createPicture(faces.background);
        accepted = enqueueNativePagerPictureTurn(canvas, {
          id: nativeAutomaticPageTurnId(turn.id),
          frontPicture,
          backgroundLeftPicture: backgroundPicture,
          pixelWidth,
          pixelHeight,
          direction: turn.direction,
          spread: false,
          startAtMs: Date.now(),
          durationMs: getReaderPageTurnDuration(
            'page',
            0,
            undefined,
            turn.direction < 0,
          ),
          launchIntervalMs: AUTOMATIC_PAGE_TURN_START_INTERVAL_MS,
          paperColor,
        });
      } catch {
        accepted = false;
      } finally {
        frontPicture?.dispose();
        backgroundPicture?.dispose();
      }
      if (!accepted) {
        setReady(false);
        return;
      }
      submittedTurnIds.current.add(turn.id);
    }
  }, [automaticActive, canvasRef, createPicture, paperColor, pixelHeight, pixelWidth, turns]);

  useEffect(() => {
    if (!active || (!automaticActive && !interactiveTurn)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drainEvents = () => {
      for (const event of takeNativePagerEvents(canvas)) {
        const turnId = readerAutomaticPageTurnId(event.id);
        if (turnId === undefined || !submittedTurnIds.current.has(turnId)) {
          surfaceBindingRef.current?.onNativeEvent(event);
          continue;
        }
        if (event.event === 'started') {
          const presented = presentedTurnIds.current;
          const previousSize = presented.size;
          presented.add(turnId);
          if (presented.size !== previousSize) setPresentedTurnCount(presented.size);
          continue;
        }
        if (event.event !== 'completed' && event.event !== 'cancelled') continue;
        submittedTurnIds.current.delete(turnId);
        onCompleteRef.current?.(turnId);
      }
    };
    drainEvents();
    const timer = setInterval(drainEvents, 16);
    return () => {
      clearInterval(timer);
      drainEvents();
    };
  }, [active, automaticActive, canvasRef, interactiveTurn, turns.length]);

  return {
    enabled: automaticActive,
    hasPresentedTurn: presentedTurnCount > 0,
  };
}
