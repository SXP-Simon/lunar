import type { CanvasRef, SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type {
  ReaderAutomaticTurn,
  ReaderInteractiveTurn,
  ReaderPageContent,
} from '../core/page-turn-types';
import type { ReaderPageTurnEffect } from '../core/page-turn-effect';
import type { ReaderPageTurnSurfaceBinding } from './page-turn-binding';
import {
  configureNativePagerInput,
  configureNativePagerMotion,
  nativePagerCanvasReady,
  nativePagerCompositorAvailable,
  resetNativePagerCompositor,
} from './pager-compositor';
import { useNativeAutomaticPageTurnSubmission } from './use-native-automatic-page-turns';
import { useNativeInteractivePageTurn } from './use-native-interactive-page-turn';
import { useNativePageTurnEvents } from './use-native-page-turn-events';

interface NativePageTurnsOptions {
  readonly canvasRef: RefObject<CanvasRef | null>;
  readonly enabled: boolean;
  readonly turns: readonly ReaderAutomaticTurn[];
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly paperColor: number;
  readonly createPicture: (content: ReaderPageContent) => SkPicture;
  readonly onComplete?: (turnId: number) => void;
  readonly pageTurnEffect: ReaderPageTurnEffect;
  readonly fixedChromeTop: number;
  readonly fixedChromeBottom: number;
  readonly currentContent?: ReaderPageContent;
  readonly interactiveSource?: ReaderPageContent;
  readonly interactiveTurn?: ReaderInteractiveTurn;
  readonly surfaceBinding?: ReaderPageTurnSurfaceBinding;
}

interface NativePageTurnsState {
  readonly enabled: boolean;
  readonly presentedTurnId?: number;
}

export function useNativePageTurns({
  canvasRef,
  enabled,
  turns,
  pixelWidth,
  pixelHeight,
  paperColor,
  createPicture,
  onComplete,
  pageTurnEffect,
  fixedChromeTop,
  fixedChromeBottom,
  currentContent,
  interactiveSource,
  interactiveTurn,
  surfaceBinding,
}: NativePageTurnsOptions): NativePageTurnsState {
  const supported = useMemo(
    () => enabled && nativePagerCompositorAvailable(),
    [enabled],
  );
  const nativeConfigKey = pageTurnEffect.native
    ? `${pageTurnEffect.native.visualKind}:${fixedChromeTop}:${fixedChromeBottom}`
    : undefined;
  const [configuredNativeKey, setConfiguredNativeKey] = useState<string>();
  const active = supported && configuredNativeKey === nativeConfigKey;
  const automaticActive = active && onComplete !== undefined;
  const submittedTurnIds = useRef(new Set<number>());
  const submittedGestureStockIds = useRef(new Set<string>());
  const anchorKey = useRef<string | undefined>(undefined);
  const rejectAutomaticSubmission = useCallback(() => setConfiguredNativeKey(undefined), []);

  useEffect(() => {
    if (!supported || configuredNativeKey === nativeConfigKey || turns.length > 0) return;
    let cancelled = false;
    let frame = 0;
    const probe = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (
        canvas
        && nativePagerCanvasReady(canvas)
        && pageTurnEffect.native
        && configureNativePagerMotion(
          canvas,
          pageTurnEffect.native.visualKind,
          fixedChromeTop,
          fixedChromeBottom,
          pageTurnEffect.native.motion,
          pageTurnEffect.native.planarMotion,
        )
      ) {
        setConfiguredNativeKey(nativeConfigKey);
        return;
      }
      frame = requestAnimationFrame(probe);
    };
    probe();
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [
    canvasRef,
    configuredNativeKey,
    fixedChromeBottom,
    fixedChromeTop,
    pageTurnEffect,
    nativeConfigKey,
    supported,
    turns.length,
  ]);

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
    };
  }, [active, canvasRef, surfaceBinding]);

  useNativeInteractivePageTurn({
    active,
    canvasRef,
    createPicture,
    currentContent,
    interactiveSource,
    interactiveTurn,
    pageTurnEffect,
    paperColor,
    pixelHeight,
    pixelWidth,
    surfaceBinding,
    turnsActive: turns.length > 0,
    anchorKeyRef: anchorKey,
    submittedStockIdsRef: submittedGestureStockIds,
  });

  useNativeAutomaticPageTurnSubmission({
    active: automaticActive,
    canvasRef,
    createPicture,
    paperColor,
    pixelHeight,
    pixelWidth,
    submittedTurnIds,
    turns,
    onRejected: rejectAutomaticSubmission,
    pageTurnEffect,
  });

  const presentedTurnId = useNativePageTurnEvents({
    active,
    automaticActive,
    canvasRef,
    interactiveTurn,
    onComplete,
    submittedTurnIds,
    surfaceBinding,
    turns,
  });

  return {
    enabled: automaticActive,
    presentedTurnId,
  };
}

export { useNativePageTurns as useNativeAutomaticPageTurns };
