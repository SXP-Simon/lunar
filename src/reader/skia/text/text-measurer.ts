import type {
  ReaderFontMetrics,
  ReaderFontMetricsProvider,
  ReaderMeasurePaint,
  ReaderTextMeasurer,
  ReaderTextMetrics,
} from '../../contracts';
import type { LunarSkiaFontRegistry } from '../fonts/font-registry';
import {
  LunarSkiaParagraphFactory,
  type SkiaParagraphFactory,
} from './paragraph-factory';

export interface SkiaTextMeasurer extends ReaderTextMeasurer, ReaderFontMetricsProvider {
  readonly fontResolver: LunarSkiaFontRegistry;
  readonly paragraphs: SkiaParagraphFactory;
  clearCache(): void;
  dispose(): void;
}

const MAX_TEXT_MEASUREMENTS = 16_384;
const MAX_FONT_METRICS = 256;

export class LunarSkiaTextMeasurer implements SkiaTextMeasurer {
  private readonly textCache = new Map<string, ReaderTextMetrics>();
  private readonly metricsCache = new Map<string, ReaderFontMetrics>();
  private disposed = false;

  constructor(
    readonly fontResolver: LunarSkiaFontRegistry,
    readonly paragraphs: SkiaParagraphFactory = new LunarSkiaParagraphFactory(fontResolver),
  ) {}

  measureText(text: string, paint: ReaderMeasurePaint): ReaderTextMetrics {
    this.assertActive();
    const key = createTextKey(text, paint);
    const cached = this.textCache.get(key);
    if (cached) {
      return cached;
    }

    const metrics = {
      width: this.measureWidth(text, paint),
      height: paint.font.sizePx,
    };
    writeBoundedCache(this.textCache, key, metrics, MAX_TEXT_MEASUREMENTS);
    return metrics;
  }

  resolveFontMetrics(paint: ReaderMeasurePaint): ReaderFontMetrics {
    this.assertActive();
    const key = createFontKey(paint);
    const cached = this.metricsCache.get(key);
    if (cached) {
      return cached;
    }

    const metrics = this.fontResolver.resolveFont(paint.font).getMetrics();
    const resolved = {
      ascentPx: Math.max(0, -metrics.ascent),
      descentPx: Math.max(0, metrics.descent),
      lineGapPx: Math.max(0, metrics.leading),
      contentHeightPx:
        Math.max(0, -metrics.ascent) +
        Math.max(0, metrics.descent) +
        Math.max(0, metrics.leading),
    };
    writeBoundedCache(this.metricsCache, key, resolved, MAX_FONT_METRICS);
    return resolved;
  }

  clearCache(): void {
    this.textCache.clear();
    this.metricsCache.clear();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.clearCache();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('The Skia text measurer is disposed.');
    }
  }

  private measureWidth(text: string, paint: ReaderMeasurePaint): number {
    const font = this.fontResolver.resolveFont(paint.font);
    if (hasCustomSpacing(paint) || requiresParagraphShaping(text, font)) {
      return this.paragraphs.measureShapedText(text, paint).width;
    }

    // Rito's pagination repeatedly probes differently sized slices while it
    // searches a line break. Creating a Paragraph for every probe costs far
    // more than measuring the matching SkFont. Paragraphs stay reserved for
    // spacing-sensitive runs and for the renderer, where shaping is required
    // for the final draw command.
    return font.getTextWidth(text);
  }
}

function createTextKey(text: string, paint: ReaderMeasurePaint): string {
  return `${createFontKey(paint)}\0${paint.wordSpacingPx ?? 0}\0${paint.letterSpacingPx ?? 0}\0${text}`;
}

function createFontKey(paint: ReaderMeasurePaint): string {
  const { font } = paint;
  return `${font.family}\0${font.weight}\0${font.style}\0${font.sizePx}`;
}

function hasCustomSpacing(paint: ReaderMeasurePaint): boolean {
  return (paint.wordSpacingPx ?? 0) !== 0 || (paint.letterSpacingPx ?? 0) !== 0;
}

function requiresParagraphShaping(
  text: string,
  font: ReturnType<LunarSkiaFontRegistry['resolveFont']>,
): boolean {
  // Paragraph can select a system fallback face for a missing glyph, while a
  // SkFont has one fixed typeface. Paginating with the latter's .notdef
  // advance places more text on each line than the Paragraph renderer shows.
  // Shaped scripts also need Paragraph's HarfBuzz layout, even when every
  // code point exists in the primary font.
  return hasComplexScript(text) || font.getGlyphIDs(text).some((glyphId) => glyphId === 0);
}

function hasComplexScript(text: string): boolean {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      (codePoint >= 0x0590 && codePoint <= 0x08ff) ||
      (codePoint >= 0x0900 && codePoint <= 0x0dff) ||
      (codePoint >= 0x0f00 && codePoint <= 0x109f) ||
      (codePoint >= 0x1780 && codePoint <= 0x18af)
    ) {
      return true;
    }
  }
  return false;
}

function writeBoundedCache<T>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    cache.delete(oldest);
  }
}
