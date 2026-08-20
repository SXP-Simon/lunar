import type { FontMetricsProvider, TextMeasurer } from '@ritojs/core';
import type { SkFontMgr, SkTypefaceFontProvider } from '@shopify/react-native-skia';

export interface LunarFontResolver {
  readonly systemFontManager: SkFontMgr;
  readonly bookFontProvider: SkTypefaceFontProvider;
  clear(): void;
}

export interface SkiaTextMeasurer extends TextMeasurer, FontMetricsProvider {
  readonly fontResolver: LunarFontResolver;
  clearCache(): void;
  dispose(): void;
}
