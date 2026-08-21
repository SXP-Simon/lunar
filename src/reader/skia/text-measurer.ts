import type { SkFontMgr, SkTypefaceFontProvider } from '@shopify/react-native-skia';

import type { ReaderFontMetricsProvider, ReaderTextMeasurer } from '../contracts';

export interface LunarFontResolver {
  readonly systemFontManager: SkFontMgr;
  readonly bookFontProvider: SkTypefaceFontProvider;
  clear(): void;
}

export interface SkiaTextMeasurer extends ReaderTextMeasurer, ReaderFontMetricsProvider {
  readonly fontResolver: LunarFontResolver;
  clearCache(): void;
  dispose(): void;
}
