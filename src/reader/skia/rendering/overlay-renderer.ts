import { PaintStyle, Skia, type SkCanvas } from '@shopify/react-native-skia';

import type { ReaderRect } from '../../contracts';
import { skiaColor } from './color-adapter';

export interface ReaderOverlayRect {
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
