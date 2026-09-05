import type { ReaderRenderFrame, ReaderSnapshot } from '../../contracts';
import type { ReaderPageContent, ReaderPageOverlay } from '../anime/core/page-turn-types';

export type ReaderPageOverlayResolver = (
  snapshot: ReaderSnapshot,
  frame: ReaderRenderFrame,
) => readonly ReaderPageOverlay[];

export function decorateReaderPageOverlays(
  content: ReaderPageContent,
  resolveOverlays?: ReaderPageOverlayResolver,
): ReaderPageContent {
  return resolveOverlays
    ? { ...content, overlays: resolveOverlays(content.snapshot, content.frame) }
    : content;
}
