import type { FontRegistry } from '@ritojs/core';
import type { SkFontMgr, SkTypefaceFontProvider } from '@shopify/react-native-skia';

export interface SkiaFontRegistry extends FontRegistry {
  readonly systemFontManager: SkFontMgr;
  readonly bookFontProvider: SkTypefaceFontProvider;
  dispose(): void;
}
