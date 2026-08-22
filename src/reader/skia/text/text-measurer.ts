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

const MAX_TEXT_MEASUREMENTS = 4096;
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
    const cached = readLru(this.textCache, key);
    if (cached) {
      return cached;
    }

    const shaped = this.paragraphs.measureShapedText(text, paint);
    const metrics = {
      width: shaped.width,
      height: paint.font.sizePx,
    };
    writeLru(this.textCache, key, metrics, MAX_TEXT_MEASUREMENTS);
    return metrics;
  }

  resolveFontMetrics(paint: ReaderMeasurePaint): ReaderFontMetrics {
    this.assertActive();
    const key = createFontKey(paint);
    const cached = readLru(this.metricsCache, key);
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
    writeLru(this.metricsCache, key, resolved, MAX_FONT_METRICS);
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
}

function createTextKey(text: string, paint: ReaderMeasurePaint): string {
  return `${createFontKey(paint)}\0${paint.wordSpacingPx ?? 0}\0${paint.letterSpacingPx ?? 0}\0${text}`;
}

function createFontKey(paint: ReaderMeasurePaint): string {
  const { font } = paint;
  return `${font.family}\0${font.weight}\0${font.style}\0${font.sizePx}`;
}

function readLru<T>(cache: Map<string, T>, key: string): T | undefined {
  const value = cache.get(key);
  if (value === undefined) {
    return undefined;
  }
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function writeLru<T>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    cache.delete(oldest);
  }
}
