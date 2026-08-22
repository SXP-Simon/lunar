import {
  FontSlant,
  FontWidth,
  Skia,
  type FontStyle,
  type SkFont,
  type SkFontMgr,
  type SkParagraph,
  type SkTextStyle,
  type SkTypeface,
  type SkTypefaceFontProvider,
} from '@shopify/react-native-skia';

import type {
  ReaderFontRegistry,
  ReaderFontShorthand,
  ReaderMeasurePaint,
  ReaderTextShadow,
} from '../contracts';

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

  measureShapedText(text: string, paint: ReaderMeasurePaint) {
    const paragraph = this.createParagraph(text, paint);
    try {
      paragraph.layout(SINGLE_LINE_LAYOUT_WIDTH);
      return {
        width: paragraph.getLongestLine(),
        height: paragraph.getHeight(),
      };
    } finally {
      paragraph.dispose();
    }
  }

  createParagraph(
    text: string,
    paint: ReaderMeasurePaint,
    options: {
      readonly color?: string;
      readonly alpha?: number;
      readonly textShadow?: readonly ReaderTextShadow[];
    } = {},
  ): SkParagraph {
    this.assertActive();
    const families = getFontFamilies(paint.font.family);
    const provider = families.some((family) =>
      this.bookFamilies.has(normalizeFamily(family)),
    )
      ? this.bookFontProvider
      : undefined;
    const builder = provider
      ? Skia.ParagraphBuilder.Make({}, provider)
      : Skia.ParagraphBuilder.Make({});
    const style: SkTextStyle = {
      color: colorWithAlpha(options.color ?? '#000000', options.alpha ?? 1),
      fontFamilies: families.length > 0 ? families : ['sans-serif'],
      fontSize: paint.font.sizePx,
      fontStyle: {
        weight: paint.font.weight,
        width: FontWidth.Normal,
        slant:
          paint.font.style === 'italic'
            ? FontSlant.Italic
            : FontSlant.Upright,
      },
      letterSpacing: paint.letterSpacingPx ?? 0,
      wordSpacing: paint.wordSpacingPx ?? 0,
      locale: 'zh-Hans',
      ...(options.textShadow
        ? {
            shadows: options.textShadow.map((shadow) => ({
              color: colorWithAlpha(shadow.color, options.alpha ?? 1),
              offset: { x: shadow.offsetX, y: shadow.offsetY },
              blurRadius: shadow.blur,
            })),
          }
        : {}),
    };

    try {
      builder.pushStyle(style).addText(text).pop();
      return builder.build();
    } finally {
      builder.reset();
    }
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

const SINGLE_LINE_LAYOUT_WIDTH = 100_000;

function colorWithAlpha(value: string, alpha: number) {
  const color = Skia.Color(value);
  const resolved = new Float32Array(color);
  resolved[3] = (resolved[3] ?? 1) * Math.min(1, Math.max(0, alpha));
  return resolved;
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
