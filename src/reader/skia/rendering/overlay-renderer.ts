import { PaintStyle, Skia, type SkCanvas } from '@shopify/react-native-skia';

import type { ReaderPublicationView, ReaderRect, ReaderTextRangeGeometryRequest } from '../../contracts';
import { skiaColor } from './color-adapter';

export interface ReaderOverlayRect {
  readonly revisionId?: number;
  readonly bounds: ReaderRect;
  readonly color: string;
  readonly radius?: number;
  readonly outline?: boolean;
  readonly thickness?: number;
}

/** Paints revision-scoped selection, search and annotation rectangles. */
export function renderSkiaOverlays(canvas: SkCanvas, overlays: readonly ReaderOverlayRect[]): void {
  for (const overlay of overlays) {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(skiaColor(overlay.color));
    paint.setStyle(overlay.outline ? PaintStyle.Stroke : PaintStyle.Fill);
    if (overlay.outline) paint.setStrokeWidth(Math.max(1, overlay.thickness ?? 1));
    const rect = Skia.XYWHRect(overlay.bounds.x, overlay.bounds.y, overlay.bounds.width, overlay.bounds.height);
    if (overlay.radius && overlay.radius > 0) canvas.drawRRect(Skia.RRectXY(rect, overlay.radius, overlay.radius), paint);
    else canvas.drawRect(rect, paint);
    paint.dispose();
  }
}

export async function resolveReaderRangeOverlays(
  publication: ReaderPublicationView,
  revisionId: number,
  request: ReaderTextRangeGeometryRequest,
  style: Omit<ReaderOverlayRect, 'bounds' | 'revisionId'>,
): Promise<readonly ReaderOverlayRect[]> {
  const rects = await publication.resolveTextRangeGeometry?.(request) ?? [];
  return rects.map((rect) => ({ ...style, revisionId, bounds: rect.bounds }));
}
