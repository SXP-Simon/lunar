import type { CanvasRef, SkPicture } from '@shopify/react-native-skia';
import { useEffect, type RefObject } from 'react';

import { AUTOMATIC_PAGE_TURN_START_INTERVAL_MS } from '../core/page-turn-concurrency';
import type { ReaderPageTurnEffect } from '../core/page-turn-effect';
import type { ReaderAutomaticTurn, ReaderPageContent } from '../core/page-turn-types';
import { nativeAutomaticPageTurnFaces, nativeAutomaticPageTurnId } from './page-turn';
import { enqueueNativePagerPictureTurn } from './pager-compositor';

interface NativeAutomaticPageTurnsOptions {
  readonly active: boolean;
  readonly canvasRef: RefObject<CanvasRef | null>;
  readonly createPicture: (content: ReaderPageContent) => SkPicture;
  readonly paperColor: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly submittedTurnIds: RefObject<Set<number>>;
  readonly turns: readonly ReaderAutomaticTurn[];
  readonly onRejected: () => void;
  readonly pageTurnEffect: ReaderPageTurnEffect;
}

export function useNativeAutomaticPageTurnSubmission({
  active,
  canvasRef,
  createPicture,
  paperColor,
  pixelHeight,
  pixelWidth,
  submittedTurnIds,
  turns,
  onRejected,
  pageTurnEffect,
}: NativeAutomaticPageTurnsOptions): void {
  useEffect(() => {
    if (!active || turns.length === 0 || pixelWidth <= 0 || pixelHeight <= 0) return;
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
          durationMs: pageTurnEffect.motion.getDuration({
            releaseVelocity: 0,
            animationDuration: 360,
            incomingPageLanding: turn.direction < 0,
          }),
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
        onRejected();
        return;
      }
      submittedTurnIds.current.add(turn.id);
    }
  }, [
    active,
    canvasRef,
    createPicture,
    onRejected,
    pageTurnEffect,
    paperColor,
    pixelHeight,
    pixelWidth,
    submittedTurnIds,
    turns,
  ]);
}
