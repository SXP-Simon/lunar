import type { CanvasRef, SkPicture } from '@shopify/react-native-skia';
import { useEffect, type RefObject } from 'react';

import { AUTOMATIC_PAGE_TURN_START_INTERVAL_MS } from '../core/page-turn-concurrency';
import type { ReaderPageTurnEffect } from '../core/page-turn-effect';
import type { ReaderInteractiveTurn, ReaderPageContent } from '../core/page-turn-types';
import { nativeInteractivePageTurnStockId } from './page-turn';
import type { ReaderPageTurnSurfaceBinding } from './page-turn-binding';
import {
  configureNativePagerInput,
  setNativePagerAnchor,
  stockNativePagerPicture,
} from './pager-compositor';

interface NativeInteractivePageTurnOptions {
  readonly active: boolean;
  readonly canvasRef: RefObject<CanvasRef | null>;
  readonly createPicture: (content: ReaderPageContent) => SkPicture;
  readonly currentContent?: ReaderPageContent;
  readonly interactiveSource?: ReaderPageContent;
  readonly interactiveTurn?: ReaderInteractiveTurn;
  readonly paperColor: number;
  readonly pageTurnEffect: ReaderPageTurnEffect;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly surfaceBinding?: ReaderPageTurnSurfaceBinding;
  readonly turnsActive: boolean;
  readonly anchorKeyRef: RefObject<string | undefined>;
  readonly submittedStockIdsRef: RefObject<Set<string>>;
}

export function useNativeInteractivePageTurn({
  active,
  canvasRef,
  createPicture,
  currentContent,
  interactiveSource,
  interactiveTurn,
  paperColor,
  pageTurnEffect,
  pixelHeight,
  pixelWidth,
  surfaceBinding,
  turnsActive,
  anchorKeyRef,
  submittedStockIdsRef,
}: NativeInteractivePageTurnOptions): void {
  useEffect(() => {
    if (!active || !surfaceBinding || turnsActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const source = interactiveSource ?? currentContent;
    if (!source || interactiveTurn?.nativeGesture?.driven) return;
    if (anchorKeyRef.current === source.key) return;
    if (!setNativePagerAnchor(canvas, source.key)) {
      surfaceBinding.inputReady.set(false);
      return;
    }
    surfaceBinding.inputReady.set(configureNativePagerInput(canvas, true));
    anchorKeyRef.current = source.key;
    submittedStockIdsRef.current.clear();
    surfaceBinding.stockedGestureToken.set(0);
  }, [
    active,
    anchorKeyRef,
    canvasRef,
    currentContent,
    interactiveSource,
    interactiveTurn?.nativeGesture?.driven,
    submittedStockIdsRef,
    surfaceBinding,
    turnsActive,
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
    if (!canvas || anchorKeyRef.current !== interactiveSource.key) return;
    const stockId = nativeInteractivePageTurnStockId(
      nativeGesture.token,
      nativeGesture.preparedTurnId,
    );
    if (submittedStockIdsRef.current.has(stockId)) {
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
        durationMs: pageTurnEffect.motion.getDuration({
          releaseVelocity: 0,
          animationDuration: 360,
          incomingPageLanding: interactiveTurn.direction < 0,
        }),
        rapidDurationMs: pageTurnEffect.motion.getDuration({
          releaseVelocity: 0,
          animationDuration: 360,
          incomingPageLanding: false,
        }),
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
    submittedStockIdsRef.current.add(stockId);
    surfaceBinding.stockedGestureToken.set(nativeGesture.token);
  }, [
    active,
    anchorKeyRef,
    canvasRef,
    createPicture,
    interactiveSource,
    interactiveTurn,
    paperColor,
    pageTurnEffect,
    pixelHeight,
    pixelWidth,
    submittedStockIdsRef,
    surfaceBinding,
  ]);
}
