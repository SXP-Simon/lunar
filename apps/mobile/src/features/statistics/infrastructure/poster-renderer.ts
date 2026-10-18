import { Skia, TileMode, ClipOp, BlendMode, BlurStyle, PaintStyle, type SkTypeface } from '@shopify/react-native-skia';
import { drawAmbientBackground } from './poster-background';
import { posterCoverSource } from '../domain/poster-crop';
import { Asset } from 'expo-asset';
import { loadPosterBrand } from './poster-brand';
import {
  posterBookTitle,
  posterQuoteLayout,
  wrapPosterText,
  type PosterLabels,
  type PosterPage,
} from '../domain/poster';

let fontPromise: Promise<SkTypeface> | undefined;
export function preparePosterTypeface() {
  return (fontPromise ??= (async () => {
    const asset = Asset.fromModule(require('../../../../assets/fonts/LXGWWenKai-Regular.ttf'));
    await asset.downloadAsync();
    const data = await Skia.Data.fromURI(asset.localUri || asset.uri);
    try {
      const face = Skia.Typeface.MakeFreeTypeFaceFromData(data);
      if (!face) throw Error('Poster font unavailable');
      return face;
    } finally {
      data.dispose();
    }
  })().catch((error) => {
    fontPromise = undefined;
    throw error;
  }));
}

/** CPU raster surface: draw and release each cover before decoding the next one.
 * The editor's transparent overlay reuses the exact exported captions and shading.
 * Never depend on Fresco's evictable SVG cache for a full-year, hundred-cover export. */
export async function renderPoster(
  page: PosterPage,
  labels: PosterLabels,
  signal: { aborted: boolean },
  typeface?: SkTypeface,
  coverOverlay = false,
) {
  const face = typeface ?? (await preparePosterTypeface());
  const brand = coverOverlay ? null : await loadPosterBrand();
  const scale = page.height === 1440 ? (coverOverlay ? 2 : 3) : page.height <= 2000 ? 2 : 1;
  const surface = Skia.Surface.Make(page.width * scale, page.height * scale);
  if (!surface) throw Error('Poster bitmap allocation failed');
  const canvas = surface.getCanvas();
  canvas.scale(scale, scale);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const font = Skia.Font(face, 20);
  const ink = '#ffffff',
    muted = '#b8b8bf',
    accent = '#ffffff',
    paper = '#000000';
  const glowPaint = Skia.Paint();
  glowPaint.setAntiAlias(true);
  const softGlow = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 2, true);
  const coverGlow = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 8, true);
  const featured = new Set(
    [...page.tiles]
      .sort((a, b) => b.book.milliseconds - a.book.milliseconds || a.book.id.localeCompare(b.book.id))
      .slice(0, 3)
      .map((tile) => tile.book.id),
  );
  const color = (value: string) => {
    paint.setShader(null);
    paint.setColor(Skia.Color(value));
  };
  const rect = (x: number, y: number, w: number, h: number, value: string) => {
    color(value);
    canvas.drawRect(Skia.XYWHRect(x, y, w, h), paint);
  };
  const line = (x: number, y: number, x2: number, y2: number, value = '#ffffff26') => {
    color(value);
    paint.setStrokeWidth(1);
    canvas.drawLine(x, y, x2, y2, paint);
  };
  const circle = (x: number, y: number, r: number, value: string) => {
    color(value);
    canvas.drawCircle(x, y, r, paint);
  };
  const text = (value: string, x: number, y: number, size: number, valueColor = ink, end = false, glow = false) => {
    if (!value) return;
    font.setSize(size);
    color(valueColor);
    const offset = end ? font.getGlyphWidths(font.getGlyphIDs(value)).reduce((sum, n) => sum + n, 0) : 0;
    if (glow) {
      glowPaint.setStyle(PaintStyle.Fill);
      glowPaint.setColor(Skia.Color('#ffffff55'));
      glowPaint.setMaskFilter(softGlow);
      canvas.drawText(value, x - offset, y, glowPaint, font);
    }
    canvas.drawText(value, x - offset, y, paint, font);
  };
  try {
    canvas.clear(Skia.Color(coverOverlay ? '#00000000' : paper));
    if (!coverOverlay) {
      await drawAmbientBackground(canvas, page, signal);
      line(64, 47, 1016, 47);
      if (labels.page) text(labels.page, 1016, 82, 16, muted, true);
      text(wrapPosterText(labels.title, 20, 1)[0] || '', 64, 147, 44, ink, false, true);
      text(labels.range, 64, 190, 19, muted);
      text(labels.total, 1016, 190, 20, muted, true);
      // Draw the three soft halos behind the entire mosaic, keeping small-cover gutters dark.
      glowPaint.setStyle(PaintStyle.Stroke);
      glowPaint.setStrokeWidth(2);
      glowPaint.setColor(Skia.Color('#ffffff65'));
      glowPaint.setMaskFilter(coverGlow);
      for (const tile of page.tiles) {
        if (featured.has(tile.book.id))
          canvas.drawRect(Skia.XYWHRect(tile.x, tile.y, tile.width, tile.height), glowPaint);
      }
    }
    for (const tile of page.tiles) {
      if (signal.aborted) throw Error('Poster cancelled');
      const { book, x, y, width: w, height: h } = tile;
      canvas.save();
      canvas.clipRect(Skia.XYWHRect(x, y, w, h), ClipOp.Intersect, false);
      const tint = ['#284358', '#6e5563', '#587267', '#a48058', '#4a5c73', '#9d9380'][
        Array.from(book.id).reduce((s, c) => s + c.charCodeAt(0), 0) % 6
      ];
      if (!coverOverlay) {
        rect(x, y, w, h, tint);
        if (book.coverUri) {
          const data = await Skia.Data.fromURI(book.coverUri);
          try {
            const image = Skia.Image.MakeImageFromEncoded(data);
            if (!image) throw Error('Cover decode failed');
            try {
              const source = posterCoverSource(image.width(), image.height(), w, h, book.crop);
              color('#ffffff');
              canvas.drawImageRectCubic(
                image,
                Skia.XYWHRect(source.x, source.y, source.width, source.height),
                Skia.XYWHRect(x, y, w, h),
                1 / 3,
                1 / 3,
                paint,
              );
            } finally {
              image.dispose();
            }
          } finally {
            data.dispose();
          }
        } else {
          circle(x + w * 0.72, y + h * 0.27, Math.min(w, h) * 0.16, '#9b8ba3');
        }
      }
      rect(x, y, w, h, '#0000000c');
      color('#ffffff');
      const shade = Skia.Shader.MakeLinearGradient(
        { x, y },
        { x, y: y + h },
        [Skia.Color('#00000000'), Skia.Color('#00000008'), Skia.Color('#000000ee')],
        [0, 0.38, 1],
        TileMode.Clamp,
      );
      try {
        paint.setShader(shade);
        canvas.drawRect(Skia.XYWHRect(x, y, w, h), paint);
      } finally {
        paint.setShader(null);
        shade.dispose();
      }
      // A clear central plateau and a gentle outer falloff. Clip to covers only;
      // captions are drawn afterwards, and the editor uses this same overlay.
      const block = page.lighting.find((region) => y >= region.y && y < region.y + region.height)!;
      const aspect = block.height / block.width;
      const count = page.tiles.filter((item) => item.y >= block.y && item.y < block.y + block.height).length;
      const opacity = count <= 6 ? 0.56 : count <= 20 ? 0.67 : 0.76;
      const edgeShade = Skia.Shader.MakeRadialGradient(
        { x: block.x + block.width / 2, y: (block.y + block.height * 0.5) / aspect },
        (block.width / 2) * 1.06,
        [Skia.Color('#00000000'), Skia.Color('#00000000'), Skia.Color('#000000')],
        [0, 0.38 / 1.06, 1],
        TileMode.Clamp,
      );
      try {
        canvas.save();
        canvas.scale(1, aspect);
        color('#ffffff');
        paint.setAlphaf(opacity);
        paint.setShader(edgeShade);
        canvas.drawRect(Skia.XYWHRect(x, y / aspect, w, h / aspect), paint);
      } finally {
        canvas.restore();
        paint.setShader(null);
        paint.setAlphaf(1);
        edgeShade.dispose();
      }
      const pad = Math.min(18, w * 0.08);
      const baseSize = Math.min(42, Math.max(8, Math.min(w / 7, h / 7)));
      const caption = posterBookTitle(book.title, w - pad * 2, h * 0.48, baseSize, tile.units >= 6, (value, size) => {
        font.setSize(size);
        return font.getGlyphWidths(font.getGlyphIDs(value)).reduce((sum, advance) => sum + advance, 0);
      });
      const { size, lines, lineHeight } = caption;
      const authorSize = Math.max(6, Math.min(19, size * 0.6));
      const authorY = y + h - Math.min(20, h * 0.07),
        titleY = authorY - authorSize - Math.min(15, h * 0.05) - (lines.length - 1) * lineHeight;
      lines.forEach((value, i) =>
        text(value, x + pad, titleY + i * lineHeight, size, ink, false, featured.has(book.id)),
      );
      text(
        wrapPosterText(book.author || labels.unknownAuthor, (w - pad * 2) / authorSize, 1)[0] || '',
        x + pad,
        authorY,
        authorSize,
        '#d8d8dd',
      );
      color(featured.has(book.id) ? '#ffffff65' : '#ffffff18');
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(featured.has(book.id) ? 1 : 0.5);
      canvas.drawRect(Skia.XYWHRect(x + 0.5, y + 0.5, w - 1, h - 1), paint);
      paint.setStyle(PaintStyle.Fill);
      canvas.restore();
      // Yield between covers so cancellation and progress remain responsive.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (!coverOverlay) {
      const note = posterQuoteLayout(page, labels.quote);
      if (note) {
        const { box, x, top, size, heading, lineHeight, lines } = note;
        canvas.save();
        canvas.clipRect(Skia.XYWHRect(box.x, box.y, box.width, box.height), ClipOp.Intersect, false);
        const centered = box.align === 'center';
        const radius = size * 0.3;
        const cx = centered ? box.x + box.width / 2 : x + radius;
        const cutout = Skia.Path.Circle(cx + radius * 0.5, top + radius * 0.65, radius * 0.85);
        canvas.save();
        canvas.clipPath(cutout, ClipOp.Difference, true);
        circle(cx, top + radius, radius, accent);
        canvas.restore();
        cutout.dispose();
        if (centered) {
          line(cx - 116, top + radius, cx - 24, top + radius);
          line(cx + 24, top + radius, cx + 116, top + radius);
        } else {
          line(x + size, top + radius, box.x + box.width - (x - box.x), top + radius);
        }
        lines.forEach((value, i) => {
          font.setSize(size);
          const width = font.getGlyphWidths(font.getGlyphIDs(value)).reduce((a, b) => a + b, 0);
          text(value, centered ? cx - width / 2 : x, top + heading + size + i * lineHeight, size, '#d8d8dd');
        });
        canvas.restore();
      }

      font.setSize(19);
      const brandWidth = font.getGlyphWidths(font.getGlyphIDs('Lunar')).reduce((a, b) => a + b, 0);
      const brandX = page.width - 64 - brandWidth - 60;
      if (brand) {
        color('#ffffff');
        const tint = Skia.ColorFilter.MakeBlend(Skia.Color('#ffffff'), BlendMode.SrcIn);
        try {
          paint.setColorFilter(tint);
          glowPaint.setStyle(PaintStyle.Fill);
          glowPaint.setColor(Skia.Color('#ffffff55'));
          glowPaint.setMaskFilter(softGlow);
          glowPaint.setColorFilter(tint);
          canvas.drawImageRectCubic(
            brand,
            Skia.XYWHRect(180, 190, 660, 640),
            Skia.XYWHRect(brandX, page.height - 66, 48, 48),
            1 / 3,
            1 / 3,
            glowPaint,
          );
          glowPaint.setColorFilter(null);
          canvas.drawImageRectCubic(
            brand,
            Skia.XYWHRect(180, 190, 660, 640),
            Skia.XYWHRect(brandX, page.height - 66, 48, 48),
            1 / 3,
            1 / 3,
            paint,
          );
        } finally {
          paint.setColorFilter(null);
          tint.dispose();
        }
      }
      text('Lunar', page.width - 64, page.height - 29, 19, ink, true, true);
    }
    if (signal.aborted) throw Error('Poster cancelled');
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      return image.encodeToBase64();
    } finally {
      image.dispose();
    }
  } finally {
    font.dispose();
    glowPaint.dispose();
    // Native MaskFilter host objects rely on GC; CanvasKit also exposes dispose.
    softGlow.dispose?.();
    coverGlow.dispose?.();
    paint.dispose();
    surface.dispose();
  }
}
