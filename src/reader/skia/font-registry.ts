import type { SkFontMgr, SkTypefaceFontProvider } from '@shopify/react-native-skia';

import type { ReaderFontRegistry } from '../contracts';

export interface SkiaFontRegistry extends ReaderFontRegistry {
  readonly systemFontManager: SkFontMgr;
  readonly bookFontProvider: SkTypefaceFontProvider;
  dispose(): void;
}
