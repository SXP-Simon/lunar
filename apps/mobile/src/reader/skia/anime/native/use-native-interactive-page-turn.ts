import type { CanvasRef, SkPicture } from '@shopify/react-native-skia';
import { useEffect, useRef, type RefObject } from 'react';

import type { ReaderPageTurnStock } from '../controller/page-turn-store';
import { AUTOMATIC_PAGE_TURN_START_INTERVAL_MS } from '../core/page-turn-concurrency';
import type { ReaderPageTurnEffect } from '../core/page-turn-effect';
import type { ReaderInteractiveTurn, ReaderPageContent } from '../core/page-turn-types';
import { nativeInteractivePageTurnStockId } from './page-turn';
import { nativePageTextureKey } from './page-texture-key';
import type { ReaderPageTurnSurfaceBinding } from './page-turn-binding';
import {
  acquireNativePageRecording,
  type NativePageRecording,
  type NativePageRecordingCache,
} from './page-recording-cache';
import { readerPerformanceEnd, readerPerformanceMark, readerPerformanceStart } from '../../../runtime/core/performance';
import { configureNativePagerInput, setNativePagerAnchor, stockNativePagerPicture } from './pager-compositor';

interface NativeInteractivePageTurnOptions {
  readonly active: boolean;
  readonly canvasRef: RefObject<CanvasRef | null>;
  readonly createPicture: (content: ReaderPageContent) => SkPicture;
  readonly recordings?: NativePageRecordingCache;
  readonly paintKey?: string;
  readonly createChromePicture?: (content: ReaderPageContent) => SkPicture;
  readonly currentContent?: ReaderPageContent;
  readonly interactiveSource?: ReaderPageContent;
  readonly interactiveTurn?: ReaderInteractiveTurn;
  /** The prepared pair to hold for the next input, idle or mid-drag. */
  readonly stock?: ReaderPageTurnStock;
  /** Bumped when the composer must be re-anchored on the visible page. */
  readonly resetEpoch?: number;
  readonly paperColor: number;
  readonly pageTurnEffect: ReaderPageTurnEffect;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly binding?: ReaderPageTurnSurfaceBinding;
  readonly turnsActive: boolean;
  readonly anchorKeyRef: RefObject<string | undefined>;
  readonly submittedStockIdsRef: RefObject<Set<string>>;
}

export function useNativeInteractivePageTurn({
  active,
  canvasRef,
  createPicture,
  createChromePicture,
  recordings,
  paintKey,
  currentContent,
  interactiveSource,
  interactiveTurn,
  stock,
  resetEpoch = 0,
  paperColor,
  pageTurnEffect,
  pixelHeight,
  pixelWidth,
  binding,
  turnsActive,
  anchorKeyRef,
  submittedStockIdsRef,
}: NativeInteractivePageTurnOptions): void {
  const paintRevision = useRef(0);
  const appliedResetEpoch = useRef(resetEpoch);

  useEffect(() => {
    if (!active || !binding || turnsActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const forceReset = appliedResetEpoch.current !== resetEpoch;
    appliedResetEpoch.current = resetEpoch;
    // Consumption advances the composer's anchor while its released sheet is
    // still moving. Mirror that address without resetting the native queue.
    if (!forceReset && interactiveTurn?.nativeGesture?.consumed && interactiveTurn.content) {
      anchorKeyRef.current = interactiveTurn.content.key;
      return;
    }
    const source = forceReset ? currentContent : (interactiveSource ?? currentContent);
    if (!source || (!forceReset && interactiveTurn?.nativeGesture?.driven)) return;
    if (!forceReset && anchorKeyRef.current === source.key) return;
    if (!setNativePagerAnchor(canvas, source.key)) {
      binding.values.nativeInputReady.set(false);
      return;
    }
    binding.values.nativeInputReady.set(configureNativePagerInput(canvas, true));
    anchorKeyRef.current = source.key;
    submittedStockIdsRef.current.clear();
    binding.onStockLost();
  }, [
    active,
    anchorKeyRef,
    binding,
    canvasRef,
    createPicture,
    currentContent,
    interactiveSource,
    interactiveTurn,
    paintKey,
    recordings,
    resetEpoch,
    submittedStockIdsRef,
    turnsActive,
  ]);

  // A sheet the finger is driving keeps the textures it started with; a
  // decoration change restocks only once that sheet is released.
  const stockPaused = interactiveTurn?.nativeGesture?.driven === true && !interactiveTurn.nativeGesture.consumed;

  useEffect(() => {
    if (!active || !binding || !stock || stockPaused || pixelWidth <= 0 || pixelHeight <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas || anchorKeyRef.current !== stock.source.key) return;
    const stockKey = JSON.stringify([
      stock.token,
      stock.preparedTurnId,
      nativePageTextureKey(stock.source, 'page', paintKey),
      nativePageTextureKey(stock.target, 'page', paintKey),
    ]);
    if (submittedStockIdsRef.current.has(stockKey)) {
      binding.onStocked(stock.token);
      return;
    }
    const stockId = nativeInteractivePageTurnStockId(stock.token, stock.preparedTurnId, ++paintRevision.current);

    let sourcePicture: NativePageRecording | undefined;
    let targetPicture: NativePageRecording | undefined;
    let sourceChrome: NativePageRecording | undefined;
    let targetChrome: NativePageRecording | undefined;
    let accepted = false;
    const recordStartedAt = readerPerformanceStart();
    let submitStartedAt: number | undefined;
    let submittedAtMs: number | undefined;
    const record = (
      factory: (content: ReaderPageContent) => SkPicture,
      content: ReaderPageContent,
      layer: 'page' | 'chrome',
    ) => acquireNativePageRecording(recordings, factory, content, layer, paintKey, pixelWidth, pixelHeight);
    try {
      sourcePicture = record(createPicture, stock.source, 'page');
      targetPicture = record(createPicture, stock.target, 'page');
      sourceChrome = createChromePicture ? record(createChromePicture, stock.source, 'chrome') : undefined;
      targetChrome = createChromePicture ? record(createChromePicture, stock.target, 'chrome') : undefined;
      readerPerformanceEnd('reader.native.record', recordStartedAt, {
        workId: stock.performanceId,
        pixelWidth,
        pixelHeight,
        prepared: stock.preparedTurnId,
      });
      submitStartedAt = readerPerformanceStart();
      submittedAtMs = submitStartedAt === undefined ? undefined : Date.now();
      const forward = stock.direction > 0;
      accepted = stockNativePagerPicture(canvas, {
        id: stockId,
        fromPageKey: stock.source.key,
        toPageKey: stock.target.key,
        frontPageKey: nativePageTextureKey(forward ? stock.source : stock.target, 'page', paintKey),
        backgroundLeftPageKey: nativePageTextureKey(forward ? stock.target : stock.source, 'page', paintKey),
        frontPicture: (forward ? sourcePicture : targetPicture).picture,
        // Curl keeps a blank back. Planar effects use the spare faces for
        // independent fixed chrome; their backward body stays underneath.
        backgroundLeftPicture: (forward ? targetPicture : sourcePicture).picture,
        backPicture: sourceChrome?.picture,
        backPageKey: sourceChrome ? nativePageTextureKey(stock.source, 'chrome', paintKey) : undefined,
        backgroundRightPicture: targetChrome?.picture,
        backgroundRightPageKey: targetChrome ? nativePageTextureKey(stock.target, 'chrome', paintKey) : undefined,
        pixelWidth,
        pixelHeight,
        direction: stock.direction,
        spread: false,
        contentRevision: stock.target.snapshot.revisionId,
        durationMs: pageTurnEffect.motion.getDuration({
          releaseVelocity: 0,
          animationDuration: 360,
          incomingPageLanding: stock.direction < 0,
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
      readerPerformanceEnd('reader.native.stock', submitStartedAt, { workId: stock.performanceId, accepted });
      readerPerformanceMark('reader.native.submit', {
        workId: stock.performanceId,
        nativeId: stockId,
        accepted,
        submittedAtMs,
      });
      sourcePicture?.release();
      targetPicture?.release();
      sourceChrome?.release();
      targetChrome?.release();
    }
    if (!accepted) {
      binding.values.nativeInputReady.set(false);
      return;
    }
    // Only the latest paint version is stocked. A -> B -> A must publish A
    // again rather than mistaking its earlier submission for current stock.
    submittedStockIdsRef.current.clear();
    submittedStockIdsRef.current.add(stockKey);
    binding.onStocked(stock.token);
  }, [
    active,
    anchorKeyRef,
    binding,
    canvasRef,
    createChromePicture,
    createPicture,
    // Retry once the anchor effect above has moved the composer to the source.
    currentContent,
    pageTurnEffect,
    paintKey,
    paperColor,
    pixelHeight,
    pixelWidth,
    recordings,
    stock,
    stockPaused,
    submittedStockIdsRef,
    turnsActive,
  ]);
}
