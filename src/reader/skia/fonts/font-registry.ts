import {
  FontSlant,
  FontWidth,
  Skia,
  type FontStyle,
  type SkFont,
  type SkTypeface,
  type SkTypefaceFontProvider,
} from '@shopify/react-native-skia';

import type {
  ReaderFontRegistry,
  ReaderFontShorthand,
} from '../../contracts';
import { LUNAR_READER_FONT_FAMILY } from '../../typography';

export interface SkiaFontRegistry extends ReaderFontRegistry {
  readonly readerFontProvider: SkTypefaceFontProvider;
  loadBuiltinFont(bytes: Uint8Array): void;
  getFontFamilies(family: string): readonly string[];
  getParagraphProvider(family: string): SkTypefaceFontProvider;
  resolveFont(font: ReaderFontShorthand): SkFont;
  dispose(): void;
}

export class LunarSkiaFontRegistry implements SkiaFontRegistry {
  readonly readerFontProvider = Skia.TypefaceFontProvider.Make();

  private readonly typefaces: SkTypeface[] = [];
  private readonly fonts = new Map<string, SkFont>();
  private builtinLoaded = false;
  private disposed = false;

  loadBuiltinFont(bytes: Uint8Array): void {
    this.assertActive();
    if (this.builtinLoaded) {
      return;
    }
    const data = Skia.Data.fromBytes(bytes);
    try {
      const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
      if (!typeface) {
        throw new Error('Skia could not decode the bundled Lunar reader font.');
      }
      this.readerFontProvider.registerFont(typeface, LUNAR_READER_FONT_FAMILY);
      this.typefaces.push(typeface);
      this.builtinLoaded = true;
    } finally {
      data.dispose();
    }
  }

  async loadFont(_resource: Parameters<ReaderFontRegistry['loadFont']>[0]): Promise<void> {
    // Reader layout forces the bundled font. EPUB @font-face declarations are
    // intentionally ignored so pagination and Skia always share one Typeface.
  }

  getFontFamilies(_family: string): readonly string[] {
    this.assertActive();
    return [LUNAR_READER_FONT_FAMILY];
  }

  getParagraphProvider(_family: string): SkTypefaceFontProvider {
    this.assertActive();
    this.assertBuiltinLoaded();
    return this.readerFontProvider;
  }

  resolveFont(font: ReaderFontShorthand): SkFont {
    this.assertActive();
    const key = `${font.sizePx}`;
    const cached = this.fonts.get(key);
    if (cached) {
      return cached;
    }

    const style: FontStyle = {
      weight: 400,
      width: FontWidth.Normal,
      slant: FontSlant.Upright,
    };
    this.assertBuiltinLoaded();
    const typeface = this.readerFontProvider.matchFamilyStyle(LUNAR_READER_FONT_FAMILY, style);
    const skFont = Skia.Font(typeface, font.sizePx);
    this.fonts.set(key, skFont);
    return skFont;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const font of this.fonts.values()) {
      font.dispose();
    }
    this.fonts.clear();
    for (const typeface of this.typefaces) {
      typeface.dispose();
    }
    this.typefaces.length = 0;
    this.readerFontProvider.dispose();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('The Skia font registry is disposed.');
    }
  }

  private assertBuiltinLoaded(): void {
    if (!this.builtinLoaded) {
      throw new Error('The bundled Lunar reader font is unavailable.');
    }
  }
}
