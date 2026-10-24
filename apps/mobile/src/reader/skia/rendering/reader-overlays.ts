import { PaintStyle, Skia, type SkCanvas } from '@shopify/react-native-skia';

import type {
  ReaderRenderFrame,
  ReaderSearchResult,
  ReaderSnapshot,
  ReaderTextRangeGeometryRequest,
  ReaderTextRangeRect,
} from '../../contracts';
import type { ReaderPageContent, ReaderPageOverlay } from '../anime/core/page-turn-types';
import { skiaColor } from './reader-colors';

export type ReaderOverlayRect = ReaderPageOverlay;

export type ReaderPageOverlayResolver = (
  snapshot: ReaderSnapshot,
  frame: ReaderRenderFrame,
) => readonly ReaderPageOverlay[];

/**
 * One independent producer of page overlays, such as persisted highlights or
 * search hits. Sources are merged rather than replaced, so each producer owns
 * only its own refinement of the visible page.
 */
export interface ReaderOverlaySource {
  readonly key: string;
  /** Overlays for any page the surface paints, including page-turn neighbours. */
  readonly resolvePage?: ReaderPageOverlayResolver;
  /** Refined overlays for the visible page; they replace this source's page result when non-empty. */
  readonly current?: readonly ReaderPageOverlay[];
}

const EmptyPageOverlays: readonly ReaderPageOverlay[] = [];

export function createReaderOverlaySourcesResolver(
  sources: readonly ReaderOverlaySource[] | undefined,
): ReaderPageOverlayResolver | undefined {
  const resolvers = sources?.flatMap((source) => (source.resolvePage ? [source.resolvePage] : [])) ?? [];
  if (resolvers.length === 0) return undefined;
  if (resolvers.length === 1) return resolvers[0];
  return (snapshot, frame) => resolvers.flatMap((resolve) => resolve(snapshot, frame));
}

export function resolveReaderCurrentOverlaySources(
  sources: readonly ReaderOverlaySource[] | undefined,
  snapshot: ReaderSnapshot,
  frame: ReaderRenderFrame | undefined,
): readonly ReaderPageOverlay[] {
  if (!sources || sources.length === 0) return EmptyPageOverlays;
  return sources.flatMap((source) => {
    if (source.current !== undefined && source.current.length > 0) return source.current;
    return frame ? (source.resolvePage?.(snapshot, frame) ?? EmptyPageOverlays) : EmptyPageOverlays;
  });
}

export function decorateReaderPageOverlays(
  content: ReaderPageContent,
  resolveOverlays?: ReaderPageOverlayResolver,
): ReaderPageContent {
  return resolveOverlays ? { ...content, overlays: resolveOverlays(content.snapshot, content.frame) } : content;
}

/** Joins adjacent run rectangles so fractional run edges cannot leave visible seams. */
export function mergeReaderOverlayRects(
  overlays: readonly ReaderOverlayRect[],
  edgeTolerance = 1.5,
): readonly ReaderOverlayRect[] {
  const merged: ReaderOverlayRect[] = [];
  for (const overlay of overlays) {
    const previous = merged.at(-1);
    if (previous && canMergeOverlays(previous, overlay, edgeTolerance)) {
      const right = Math.max(previous.bounds.x + previous.bounds.width, overlay.bounds.x + overlay.bounds.width);
      merged[merged.length - 1] = {
        ...previous,
        bounds: {
          ...previous.bounds,
          width: right - previous.bounds.x,
        },
      };
    } else {
      merged.push(overlay);
    }
  }
  return merged;
}

/** Paints revision-scoped selection, search and annotation rectangles. */
export function renderSkiaOverlays(canvas: SkCanvas, overlays: readonly ReaderOverlayRect[]): void {
  for (const overlay of mergeReaderOverlayRects(overlays)) {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(readerOverlayColor(overlay));
    const decoration = readerOverlayDecorationPath(overlay);
    if (decoration) {
      const path = Skia.Path.MakeFromSVGString(decoration);
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(overlay.thickness ?? 1.5);
      if (path) {
        canvas.drawPath(path, paint);
        path.dispose();
      }
      paint.dispose();
      continue;
    }
    paint.setStyle(overlay.outline ? PaintStyle.Stroke : PaintStyle.Fill);
    if (overlay.outline) paint.setStrokeWidth(Math.max(1, overlay.thickness ?? 1));
    const rect = Skia.XYWHRect(overlay.bounds.x, overlay.bounds.y, overlay.bounds.width, overlay.bounds.height);
    if (overlay.radius && overlay.radius > 0)
      canvas.drawRRect(Skia.RRectXY(rect, overlay.radius, overlay.radius), paint);
    else canvas.drawRect(rect, paint);
    paint.dispose();
  }
}

export function readerOverlayColor(overlay: ReaderOverlayRect) {
  const color = skiaColor(overlay.color);
  // Thin ink marks need full opacity; background fills retain their translucency.
  return overlay.decoration ? new Float32Array([color[0], color[1], color[2], 1]) : color;
}

/** Shared geometry for static Canvas nodes and recorded page-turn pictures. */
export function readerOverlayDecorationPath(overlay: ReaderOverlayRect): string | undefined {
  if (!overlay.decoration || overlay.bounds.width <= 0) return undefined;
  const { x, y, width, height } = overlay.bounds;
  const baseline = y + height - 2.5;
  let path = `M ${x} ${baseline}`;
  if (overlay.decoration === 'underline') return `${path} L ${x + width} ${baseline}`;
  // Four pixels per half-wave, with a shortened final segment at the text edge.
  for (let offset = 0, direction = -1; offset < width; offset += 4, direction *= -1) {
    const length = Math.min(4, width - offset);
    path += ` Q ${x + offset + length / 2} ${baseline + (direction * 3 * length) / 4} ${x + offset + length} ${baseline}`;
  }
  return path;
}

function canMergeOverlays(left: ReaderOverlayRect, right: ReaderOverlayRect, edgeTolerance: number): boolean {
  const sameStyle =
    left.revisionId === right.revisionId &&
    left.color === right.color &&
    left.radius === right.radius &&
    left.outline === right.outline &&
    left.decoration === right.decoration &&
    left.thickness === right.thickness;
  const sameLine =
    Math.abs(left.bounds.y - right.bounds.y) <= edgeTolerance &&
    Math.abs(left.bounds.height - right.bounds.height) <= edgeTolerance;
  const gap = right.bounds.x - left.bounds.x - left.bounds.width;
  return sameStyle && sameLine && gap >= -edgeTolerance && gap <= edgeTolerance;
}

export async function resolveReaderRangeOverlays(
  source: {
    resolveTextRangeGeometry(request: ReaderTextRangeGeometryRequest): Promise<readonly ReaderTextRangeRect[]>;
  },
  revisionId: number,
  request: ReaderTextRangeGeometryRequest,
  style: Omit<ReaderOverlayRect, 'bounds' | 'revisionId'>,
): Promise<readonly ReaderOverlayRect[]> {
  const rects = await source.resolveTextRangeGeometry(request);
  return rects.map((rect) => ({ ...style, revisionId, bounds: rect.bounds }));
}

export async function resolveReaderSearchOverlays(
  source: {
    resolveTextRangeGeometry(request: ReaderTextRangeGeometryRequest): Promise<readonly ReaderTextRangeRect[]>;
  },
  revisionId: number,
  results: readonly ReaderSearchResult[],
  style: Omit<ReaderOverlayRect, 'bounds' | 'revisionId'>,
): Promise<readonly ReaderOverlayRect[]> {
  const groups = await Promise.all(
    results.map((result) =>
      resolveReaderRangeOverlays(
        source,
        revisionId,
        {
          pageIndex: result.pageIndex,
          start: result.start,
          end: result.end,
        },
        style,
      ),
    ),
  );
  return groups.flat();
}
