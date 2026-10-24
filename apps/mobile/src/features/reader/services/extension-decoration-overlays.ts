import {
  createReaderTextSelectionFromRange,
  findReaderTextSelection,
  type ReaderRenderFrame,
  type ReaderSnapshot,
} from '@/reader';
import type { ReaderOverlayRect } from '@/reader/native';
import type {
  ReaderExtensionDecoration,
  ReaderExtensionDecorationColor,
  ReaderExtensionDecorationStyle,
} from '../extensions/reader-extensions';

export type ReaderExtensionDecorationColors = Readonly<
  Record<ReaderExtensionDecorationColor, { readonly fill: string; readonly ink: string }>
>;

const EmptyOverlays: readonly ReaderOverlayRect[] = [];

/** Places extension decorations on any painted frame, including page-turn neighbours. */
export function createReaderExtensionDecorationResolver(
  decorations: readonly ReaderExtensionDecoration[],
  colors: ReaderExtensionDecorationColors,
) {
  if (decorations.length === 0) return undefined;
  const cache = new WeakMap<ReaderRenderFrame, { key: string; overlays: readonly ReaderOverlayRect[] }>();
  return (snapshot: ReaderSnapshot, frame: ReaderRenderFrame): readonly ReaderOverlayRect[] => {
    const href = frame.manifestHref ?? snapshot.position?.locator?.manifestHref;
    const key = `${snapshot.revisionId}:${href ?? ''}`;
    const cached = cache.get(frame);
    if (cached?.key === key) return cached.overlays;
    const entries = frame.hits ?? [];
    const frameKey = frame.renderKey ?? frame.sourceKey;
    const overlays =
      entries.length === 0
        ? EmptyOverlays
        : decorations.flatMap((decoration) => {
            if (decoration.href && href && decoration.href !== href) return [];
            const exact =
              decoration.range &&
              decoration.frameKey !== undefined &&
              decoration.frameKey === frameKey &&
              decoration.revisionId === snapshot.revisionId
                ? createReaderTextSelectionFromRange(entries, decoration.range)
                : undefined;
            const selection = exact ?? findReaderTextSelection(entries, decoration);
            if (!selection) return [];
            const style = decorationStyle(decoration.style, colors[decoration.color]);
            return selection.bounds.map((bounds) => ({ revisionId: snapshot.revisionId, bounds, ...style }));
          });
    cache.set(frame, { key, overlays });
    return overlays;
  };
}

function decorationStyle(
  style: ReaderExtensionDecorationStyle,
  color: { readonly fill: string; readonly ink: string },
): Omit<ReaderOverlayRect, 'bounds' | 'revisionId'> {
  switch (style) {
    case 'outline':
      return { color: color.ink, radius: 2, outline: true, thickness: 1.5 };
    case 'underline':
    case 'wavy':
      return { color: color.ink, radius: 2, decoration: style, thickness: 1.5 };
    default:
      return { color: color.fill, radius: 2 };
  }
}
