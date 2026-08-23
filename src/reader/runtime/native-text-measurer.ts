import type {
  ReaderFontMetrics,
  ReaderFontMetricsProvider,
  ReaderMeasurePaint,
  ReaderTextMeasurer,
  ReaderTextMetrics,
} from '../contracts';
import type { ReaderNativeTextMeasurer } from '../contracts/archive';

export interface NativeTextMeasurementFallback
  extends ReaderTextMeasurer,
    ReaderFontMetricsProvider {}

/**
 * Uses the platform text stack for system-font runs so its fallback selection
 * matches the platform renderer. EPUB fonts remain with Skia, because they
 * are registered only in the Skia font provider.
 */
export class NativePaginationTextMeasurer
  implements ReaderTextMeasurer, ReaderFontMetricsProvider
{
  private readonly textCache = new Map<string, ReaderTextMetrics>();
  private readonly metricsCache = new Map<string, ReaderFontMetrics>();

  constructor(
    private readonly native: ReaderNativeTextMeasurer,
    private readonly fallback: NativeTextMeasurementFallback,
    private readonly canUseNativeFont: (family: string) => boolean,
  ) {}

  measureText(text: string, paint: ReaderMeasurePaint): ReaderTextMetrics {
    if (!this.canUseNativeFont(paint.font.family)) {
      return this.fallback.measureText(text, paint);
    }
    const key = createTextKey(text, paint);
    const cached = this.textCache.get(key);
    if (cached) {
      return cached;
    }
    const measured = this.native.measureText({ text, ...toNativeFontRequest(paint) });
    writeBoundedCache(this.textCache, key, measured, MAX_TEXT_MEASUREMENTS);
    return measured;
  }

  resolveFontMetrics(paint: ReaderMeasurePaint): ReaderFontMetrics {
    if (!this.canUseNativeFont(paint.font.family)) {
      return this.fallback.resolveFontMetrics(paint);
    }
    const key = createFontKey(paint);
    const cached = this.metricsCache.get(key);
    if (cached) {
      return cached;
    }
    const measured = this.native.resolveFontMetrics(toNativeFontRequest(paint));
    writeBoundedCache(this.metricsCache, key, measured, MAX_FONT_METRICS);
    return measured;
  }
}

const MAX_TEXT_MEASUREMENTS = 16_384;
const MAX_FONT_METRICS = 256;

function toNativeFontRequest(paint: ReaderMeasurePaint) {
  return {
    family: paint.font.family,
    weight: paint.font.weight,
    style: paint.font.style,
    sizePx: paint.font.sizePx,
    letterSpacingPx: paint.letterSpacingPx,
    wordSpacingPx: paint.wordSpacingPx,
  };
}

function createTextKey(text: string, paint: ReaderMeasurePaint): string {
  return `${createFontKey(paint)}\0${paint.wordSpacingPx ?? 0}\0${paint.letterSpacingPx ?? 0}\0${text}`;
}

function createFontKey(paint: ReaderMeasurePaint): string {
  const { font } = paint;
  return `${font.family}\0${font.weight}\0${font.style}\0${font.sizePx}`;
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
