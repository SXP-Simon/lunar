import type { CanvasRef, SkPicture } from '@shopify/react-native-skia';
import { useEffect, useRef, type RefObject } from 'react';

import { AUTOMATIC_PAGE_TURN_START_INTERVAL_MS } from '../core/page-turn-concurrency';
import type { ReaderPageTurnEffect } from '../core/page-turn-effect';
import type { ReaderInteractiveTurn, ReaderPageContent } from '../core/page-turn-types';
import { nativeInteractivePageTurnStockId } from './page-turn';
import { nativePageTextureKey } from './page-texture-key';
import type { ReaderPageTurnSurfaceBinding } from './page-turn-binding';
import { readerPerformanceEnd, readerPerformanceMark, readerPerformanceStart } from '../../../runtime/core/performance';
import {
  configureNativePagerInput,
  setNativePagerAnchor,
  stockNativePagerPicture,
} from './pager-compositor';

interface NativeInteractivePageTurnOptions {
  readonly active: boolean;
  readonly canvasRef: RefObject<CanvasRef | null>;
  readonly createPicture: (content: ReaderPageContent) => SkPicture;
  readonly createChromePicture?: (content: ReaderPageContent) => SkPicture;
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
  createChromePicture,
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
  const recording = useRef<{ sourceKey: string; createPicture: typeof createPicture } | undefined>(undefined);
  const paintRevision = useRef(0);
  useEffect(() => {
    if (!active || !surfaceBinding || turnsActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const source = interactiveSource ?? currentContent;
    if (!source || interactiveTurn?.nativeGesture?.driven) return;
    const sourceKey = nativePageTextureKey(source);
    if (anchorKeyRef.current === source.key && recording.current?.sourceKey === sourceKey
      && recording.current.createPicture === createPicture) return;
    if (!setNativePagerAnchor(canvas, source.key)) {
      surfaceBinding.inputReady.set(false);
      return;
    }
    surfaceBinding.inputReady.set(configureNativePagerInput(canvas, true));
    anchorKeyRef.current = source.key;
    recording.current = { sourceKey, createPicture };
    submittedStockIdsRef.current.clear();
    surfaceBinding.stockedGestureToken.set(0);
  }, [
    active,
    anchorKeyRef,
    canvasRef,
    createPicture,
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
      || !interactiveTurn?.content
      || !interactiveSource
      || pixelWidth <= 0
      || pixelHeight <= 0
    ) {
      if (!interactiveTurn) surfaceBinding?.stockedGestureToken.set(0);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || anchorKeyRef.current !== interactiveSource.key) return;
    const stockKey = JSON.stringify([
      nativeGesture.token,
      nativeGesture.preparedTurnId,
      nativePageTextureKey(interactiveSource), nativePageTextureKey(interactiveTurn.content),
    ]);
    if (submittedStockIdsRef.current.has(stockKey)) {
      surfaceBinding.stockedGestureToken.set(nativeGesture.token);
      return;
    }
    const stockId = nativeInteractivePageTurnStockId(
      nativeGesture.token, nativeGesture.preparedTurnId, ++paintRevision.current,
    );

    let sourcePicture: SkPicture | undefined;
    let targetPicture: SkPicture | undefined;
    let sourceChrome: SkPicture | undefined;
    let targetChrome: SkPicture | undefined;
    let accepted = false;
    const recordStartedAt = readerPerformanceStart();
    let submitStartedAt: number | undefined;
    let submittedAtMs: number | undefined;
    try {
      sourcePicture = createPicture(interactiveSource);
      targetPicture = createPicture(interactiveTurn.content);
      sourceChrome = createChromePicture?.(interactiveSource);
      targetChrome = createChromePicture?.(interactiveTurn.content);
      readerPerformanceEnd('reader.native.record', recordStartedAt, { workId: interactiveTurn.performanceId,
        pixelWidth, pixelHeight, prepared: nativeGesture.preparedTurnId });
      submitStartedAt = readerPerformanceStart();
      submittedAtMs = submitStartedAt === undefined ? undefined : Date.now();
      const forward = interactiveTurn.direction > 0;
      accepted = stockNativePagerPicture(canvas, {
        id: stockId,
        fromPageKey: interactiveSource.key,
        toPageKey: interactiveTurn.content.key,
        frontPageKey: nativePageTextureKey(forward ? interactiveSource : interactiveTurn.content),
        backgroundLeftPageKey: nativePageTextureKey(forward ? interactiveTurn.content : interactiveSource),
        frontPicture: forward ? sourcePicture : targetPicture,
        // Curl keeps a blank back. Planar effects use the spare faces for
        // independent fixed chrome; their backward body stays underneath.
        backgroundLeftPicture: forward ? targetPicture : sourcePicture,
        backPicture: sourceChrome,
        backPageKey: sourceChrome ? nativePageTextureKey(interactiveSource, 'chrome') : undefined,
        backgroundRightPicture: targetChrome,
        backgroundRightPageKey: targetChrome ? nativePageTextureKey(interactiveTurn.content, 'chrome') : undefined,
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
      readerPerformanceEnd('reader.native.stock', submitStartedAt, { workId: interactiveTurn.performanceId, accepted });
      readerPerformanceMark('reader.native.submit', { workId: interactiveTurn.performanceId, nativeId: stockId, accepted, submittedAtMs });
      sourcePicture?.dispose();
      targetPicture?.dispose();
      sourceChrome?.dispose();
      targetChrome?.dispose();
    }
    if (!accepted) {
      surfaceBinding.inputReady.set(false);
      return;
    }
    // Only the latest paint version is stocked. A -> B -> A must publish A
    // again rather than mistaking its earlier submission for current stock.
    submittedStockIdsRef.current.clear();
    submittedStockIdsRef.current.add(stockKey);
    surfaceBinding.stockedGestureToken.set(nativeGesture.token);
  }, [
    active,
    anchorKeyRef,
    canvasRef,
    createPicture,
    createChromePicture,
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
