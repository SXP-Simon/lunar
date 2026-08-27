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
  private readonly registrations = new Map<string, Promise<void>>();
  private readonly registeredLengths = new Map<string, number>();
  private readonly registeredFamilies = new Set<string>();
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

  async loadFont(resource: Parameters<ReaderFontRegistry['loadFont']>[0]): Promise<void> {
    this.assertActive();
    if (!resource.family || resource.bytes.byteLength === 0) {
      throw new Error('Reader font registration requires a family and bytes.');
    }
    if (resource.byteLength !== undefined && resource.byteLength !== resource.bytes.byteLength) {
      throw new Error(`Font ${resource.family} byte length does not match its declaration.`);
    }
    const fingerprint = resource.fingerprint ?? hashBytes(resource.bytes);
    const key = `${resource.family}|${resource.weight ?? '400'}|${resource.style ?? 'normal'}|${fingerprint}`;
    const knownLength = this.registeredLengths.get(key);
    if (knownLength !== undefined && knownLength !== resource.bytes.byteLength) {
      throw new Error(`Font ${resource.family} has conflicting byte lengths.`);
    }
    const existing = this.registrations.get(key);
    if (existing) {
      await existing;
      return;
    }
    const operation = this.registerFont(key, resource);
    this.registrations.set(key, operation);
    try {
      await operation;
    } catch (error) {
      this.registrations.delete(key);
      throw error;
    }
  }

  getFontFamilies(family: string): readonly string[] {
    this.assertActive();
    const families = splitFontFamilyStack(family).filter((name) => this.registeredFamilies.has(name));
    return [...families, LUNAR_READER_FONT_FAMILY];
  }

  getParagraphProvider(_family: string): SkTypefaceFontProvider {
    this.assertActive();
    this.assertBuiltinLoaded();
    return this.readerFontProvider;
  }

  resolveFont(font: ReaderFontShorthand): SkFont {
    this.assertActive();
    const key = `${font.family}|${font.sizePx}|${font.weight}|${font.style}`;
    const cached = this.fonts.get(key);
    if (cached) {
      return cached;
    }

    const style: FontStyle = {
      weight: Math.max(100, Math.min(900, Math.round(font.weight))),
      width: FontWidth.Normal,
      slant: font.style === 'italic' ? FontSlant.Italic : FontSlant.Upright,
    };
    this.assertBuiltinLoaded();
    const family = splitFontFamilyStack(font.family).find((name) => this.registeredFamilies.has(name)) ?? LUNAR_READER_FONT_FAMILY;
    const typeface = this.readerFontProvider.matchFamilyStyle(family, style);
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
    this.registrations.clear();
    this.registeredLengths.clear();
    this.registeredFamilies.clear();
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

  private async registerFont(
    key: string,
    resource: Parameters<ReaderFontRegistry['loadFont']>[0],
  ): Promise<void> {
    this.assertActive();
    const data = Skia.Data.fromBytes(resource.bytes);
    let typeface: SkTypeface | undefined;
    try {
      typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data) ?? undefined;
      if (!typeface) {
        throw new Error(`Skia could not decode reader font ${resource.src}.`);
      }
      this.assertActive();
      this.readerFontProvider.registerFont(typeface, resource.family);
      this.typefaces.push(typeface);
      typeface = undefined;
      this.registeredLengths.set(key, resource.bytes.byteLength);
      this.registeredFamilies.add(resource.family);
    } finally {
      typeface?.dispose();
      data.dispose();
    }
  }
}

function hashBytes(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16);
}

function splitFontFamilyStack(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let quote = '';
  for (const char of value) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char;
      continue;
    }
    if (char === ',' && !quote) {
      const name = current.trim(); if (name) result.push(name); current = ''; continue;
    }
    current += char;
  }
  const name = current.trim(); if (name) result.push(name);
  return result;
}
