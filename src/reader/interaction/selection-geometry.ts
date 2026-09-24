import type { ReaderHitEntry, ReaderRect } from '../contracts';
import type { ReaderTextSelectionEndpoint, ReaderTextSelectionRange } from './text-selection';

export interface ReaderSelectionHit {
  readonly entryIndex: number;
  readonly length: number;
  readonly bounds: ReaderRect;
  readonly vertical: boolean;
}

export interface ReaderSelectionPoint { readonly x: number; readonly y: number }

/** Transfer only numeric hit geometry to UI; keep text and source maps on RN. */
export function createReaderSelectionHits(
  entries: readonly ReaderHitEntry[], scale = 1, offsetX = 0, offsetY = 0,
): readonly ReaderSelectionHit[] {
  return entries.flatMap((entry, entryIndex) => entry.imageSource || !entry.text.length ? [] : [{
    entryIndex, length: entry.text.length, vertical: entry.bounds.height > entry.bounds.width * 1.5,
    bounds: { x: offsetX + entry.bounds.x * scale, y: offsetY + entry.bounds.y * scale,
      width: entry.bounds.width * scale, height: entry.bounds.height * scale },
  }]);
}

export function compareSelectionEndpoints(a: ReaderTextSelectionEndpoint, b: ReaderTextSelectionEndpoint): number {
  'worklet';
  return a.entryIndex === b.entryIndex ? a.charIndex - b.charIndex : a.entryIndex - b.entryIndex;
}

export function selectionEndpointAtPoint(
  hits: readonly ReaderSelectionHit[], x: number, y: number, maximumDistance: number,
): ReaderTextSelectionEndpoint | undefined {
  'worklet';
  let nearest: ReaderSelectionHit | undefined;
  let best = maximumDistance * maximumDistance;
  // Reverse traversal preserves the display list's topmost exact hit.
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    const hit = hits[index]; const b = hit.bounds;
    const dx = Math.max(b.x - x, 0, x - b.x - b.width);
    const dy = Math.max(b.y - y, 0, y - b.y - b.height);
    const distance = dx * dx + dy * dy;
    if (distance <= best) { nearest = hit; best = distance; }
    if (distance === 0) break;
  }
  if (!nearest) return undefined;
  const b = nearest.bounds;
  const extent = nearest.vertical ? b.height : b.width;
  const offset = nearest.vertical ? y - b.y : x - b.x;
  const ratio = extent > 0 ? Math.min(1, Math.max(0, offset / extent)) : 0;
  return { entryIndex: nearest.entryIndex, charIndex: Math.round(ratio * nearest.length) };
}

export function moveReaderSelectionRange(
  range: ReaderTextSelectionRange, origin: ReaderTextSelectionRange,
  boundary: 'start' | 'end' | 'extend', endpoint: ReaderTextSelectionEndpoint,
): ReaderTextSelectionRange {
  'worklet';
  let start = boundary === 'start' ? endpoint : range.start;
  let end = boundary === 'end' ? endpoint : range.end;
  if (boundary === 'extend') {
    const before = compareSelectionEndpoints(endpoint, origin.start) < 0;
    start = before ? endpoint : origin.start;
    end = before || compareSelectionEndpoints(endpoint, origin.end) < 0 ? origin.end : endpoint;
  }
  if (compareSelectionEndpoints(start, end) >= 0) return range;
  if (compareSelectionEndpoints(start, range.start) === 0 && compareSelectionEndpoints(end, range.end) === 0) return range;
  return { start, end };
}

export function readerSelectionRects(hits: readonly ReaderSelectionHit[], range: ReaderTextSelectionRange): ReaderRect[] {
  'worklet';
  const rects: ReaderRect[] = [];
  for (const hit of hits) {
    if (hit.entryIndex < range.start.entryIndex) continue;
    if (hit.entryIndex > range.end.entryIndex) break;
    const from = hit.entryIndex === range.start.entryIndex ? range.start.charIndex : 0;
    const to = hit.entryIndex === range.end.entryIndex ? range.end.charIndex : hit.length;
    if (to <= from) continue;
    const b = hit.bounds; const start = from / hit.length; const length = (to - from) / hit.length;
    const rect = hit.vertical
      ? { x: b.x, y: b.y + b.height * start, width: b.width, height: b.height * length }
      : { x: b.x + b.width * start, y: b.y, width: b.width * length, height: b.height };
    const previous = rects[rects.length - 1];
    if (!hit.vertical && previous && Math.abs(previous.y - rect.y) < 0.5
      && Math.abs(previous.height - rect.height) < 0.5
      && Math.abs(previous.x + previous.width - rect.x) < 1) {
      rects[rects.length - 1] = { ...previous, width: rect.x + rect.width - previous.x };
    } else rects.push(rect);
  }
  return rects;
}

export function readerSelectionHandlePoints(rects: readonly ReaderRect[]): {
  start: ReaderSelectionPoint; end: ReaderSelectionPoint;
} {
  'worklet';
  const first = rects[0]; const last = rects[rects.length - 1];
  return { start: { x: first?.x ?? 0, y: first ? first.y + first.height : 0 },
    end: { x: last ? last.x + last.width : 0, y: last ? last.y + last.height : 0 } };
}
