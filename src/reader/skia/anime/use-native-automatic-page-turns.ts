import type { CanvasRef, SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import {
  AUTOMATIC_PAGE_TURN_START_INTERVAL_MS,
} from './page-turn-concurrency';
import {
  nativeAutomaticPageTurnFaces,
  nativeAutomaticPageTurnId,
  readerAutomaticPageTurnId,
} from './native-page-turn';
import { getReaderPageTurnDuration } from './page-turn-timing';
import type { ReaderAutomaticTurn, ReaderPageContent } from './page-transition';
import {
  configureNativePagerMotion,
  enqueueNativePagerPictureTurn,
  nativePagerCanvasReady,
  nativePagerCompositorAvailable,
  resetNativePagerCompositor,
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
}: NativeAutomaticPageTurnsOptions): NativeAutomaticPageTurnsState {
  const supported = useMemo(
    () => enabled && nativePagerCompositorAvailable(),
    [enabled],
  );
  const [ready, setReady] = useState(false);
  const active = supported && ready;
  const submittedTurnIds = useRef(new Set<number>());
  const presentedTurnIds = useRef(new Set<number>());
  const [presentedTurnCount, setPresentedTurnCount] = useState(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

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
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const submitted = submittedTurnIds.current;
    const presented = presentedTurnIds.current;
    return () => {
      resetNativePagerCompositor(canvas);
      submitted.clear();
      if (presented.size > 0) {
        presented.clear();
        setPresentedTurnCount(0);
      }
    };
  }, [active, canvasRef]);

  useEffect(() => {
    if (!active || turns.length === 0 || pixelWidth <= 0 || pixelHeight <= 0) {
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
  }, [active, canvasRef, createPicture, paperColor, pixelHeight, pixelWidth, turns]);

  useEffect(() => {
    if (!active || turns.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drainEvents = () => {
      for (const event of takeNativePagerEvents(canvas)) {
        const turnId = readerAutomaticPageTurnId(event.id);
        if (turnId === undefined || !submittedTurnIds.current.has(turnId)) {
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
  }, [active, canvasRef, turns.length]);

  return {
    enabled: active,
    hasPresentedTurn: presentedTurnCount > 0,
  };
}
