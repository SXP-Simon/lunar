import {
  FontSlant,
  FontWidth,
  Skia,
  type FontStyle,
  type SkFont,
  type SkFontMgr,
  type SkTypeface,
  type SkTypefaceFontProvider,
} from '@shopify/react-native-skia';

import type { ReaderFontRegistry, ReaderFontShorthand } from '../contracts';

export interface SkiaFontRegistry extends ReaderFontRegistry {
  readonly systemFontManager: SkFontMgr;
  readonly bookFontProvider: SkTypefaceFontProvider;
  dispose(): void;
}

export class LunarSkiaFontRegistry implements SkiaFontRegistry {
  readonly systemFontManager = Skia.FontMgr.System();
  readonly bookFontProvider = Skia.TypefaceFontProvider.Make();

  private readonly bookFamilies = new Set<string>();
  private readonly typefaces: SkTypeface[] = [];
  private readonly fonts = new Map<string, SkFont>();
  private disposed = false;

  async loadFont(resource: Parameters<ReaderFontRegistry['loadFont']>[0]): Promise<void> {
    this.assertActive();
    const data = Skia.Data.fromBytes(resource.bytes);
    try {
      const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
      if (!typeface) {
        throw new Error(`Skia could not decode the embedded font ${resource.src}.`);
      }
      this.bookFontProvider.registerFont(typeface, resource.family);
      this.bookFamilies.add(normalizeFamily(resource.family));
      this.typefaces.push(typeface);
    } finally {
      data.dispose();
    }
  }

  hasBookFamily(family: string): boolean {
    return getFontFamilies(family).some((candidate) =>
      this.bookFamilies.has(normalizeFamily(candidate)),
    );
  }

  getParagraphProvider(family: string): SkTypefaceFontProvider | undefined {
    return this.hasBookFamily(family) ? this.bookFontProvider : undefined;
  }

  resolveFont(font: ReaderFontShorthand): SkFont {
    this.assertActive();
    const key = `${font.family}\0${font.weight}\0${font.style}\0${font.sizePx}`;
    const cached = this.fonts.get(key);
    if (cached) {
      return cached;
    }

    const style: FontStyle = {
      weight: font.weight,
      width: FontWidth.Normal,
      slant: font.style === 'italic' ? FontSlant.Italic : FontSlant.Upright,
    };
    const families = getFontFamilies(font.family);
    const customFamily = families.find((family) =>
      this.bookFamilies.has(normalizeFamily(family)),
    );
    const manager = customFamily ? this.bookFontProvider : this.systemFontManager;
    const family = customFamily ?? families[0] ?? 'sans-serif';
    const typeface = manager.matchFamilyStyle(family, style);
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
    this.bookFontProvider.dispose();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('The Skia font registry is disposed.');
    }
  }
}

function getFontFamilies(value: string): string[] {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function normalizeFamily(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '').toLocaleLowerCase();
}
