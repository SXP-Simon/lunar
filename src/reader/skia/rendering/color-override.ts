import type { ReaderColor, ReaderRect } from '../../contracts';
import { skiaColor } from './color-adapter';

export interface SkiaColorOverride {
  readonly backgroundColor: ReaderColor | string;
  readonly foregroundColor: ReaderColor | string;
}

export interface DeclaredGround {
  readonly rect: ReaderRect;
  readonly color: ReaderColor | string;
}

export function isOpaqueColor(color: ReaderColor | string): boolean {
  return (skiaColor(color)[3] ?? 1) >= 1;
}

export function isBookOwnedPageGround(color: ReaderColor | string): boolean {
  const value = skiaColor(color);
  return (value[3] ?? 1) >= 1 && relativeLuminance(value) < 0.75;
}

export function effectiveTextColor(
  original: ReaderColor | string,
  override: SkiaColorOverride | undefined,
  declaredGround?: ReaderColor | string,
): ReaderColor | string {
  if (!override || declaredGround) return original;
  const ink = skiaColor(original);
  const ground = skiaColor(override.backgroundColor);
  if (contrastRatio(ink, ground) >= 4.5) return original;
  const [hue, saturation] = rgbToHsl(ink);
  if (saturation <= 0.05) return override.foregroundColor;
  const foreground = skiaColor(override.foregroundColor);
  const [, , lightness] = rgbToHsl(foreground);
  const relit = hslToString(hue, saturation, lightness);
  return contrastRatio(skiaColor(relit), ground) >= 4.5 ? relit : override.foregroundColor;
}

export function declaredGroundFor(
  rect: ReaderRect,
  inlineBackground: ReaderColor | string | undefined,
  blockGrounds: readonly DeclaredGround[],
  pageGround: ReaderColor | string | undefined,
): ReaderColor | string | undefined {
  if (inlineBackground && isOpaqueColor(inlineBackground)) return inlineBackground;
  for (let index = blockGrounds.length - 1; index >= 0; index -= 1) {
    const entry = blockGrounds[index];
    if (contains(entry.rect, rect)) return entry.color;
  }
  return pageGround;
}

function contains(outer: ReaderRect, inner: ReaderRect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

function contrastRatio(first: ArrayLike<number>, second: ArrayLike<number>): number {
  const a = relativeLuminance(first); const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function relativeLuminance(color: ArrayLike<number>): number {
  const channel = (value: number) => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  return 0.2126 * channel(color[0] ?? 0) + 0.7152 * channel(color[1] ?? 0) + 0.0722 * channel(color[2] ?? 0);
}

function rgbToHsl(color: ArrayLike<number>): [number, number, number] {
  const r = color[0] ?? 0; const g = color[1] ?? 0; const b = color[2] ?? 0;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function hslToString(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  let channels: [number, number, number];
  if (hue < 60) channels = [chroma, second, 0];
  else if (hue < 120) channels = [second, chroma, 0];
  else if (hue < 180) channels = [0, chroma, second];
  else if (hue < 240) channels = [0, second, chroma];
  else if (hue < 300) channels = [second, 0, chroma];
  else channels = [chroma, 0, second];
  return `rgba(${Math.round((channels[0] + match) * 255)}, ${Math.round((channels[1] + match) * 255)}, ${Math.round((channels[2] + match) * 255)}, 1)`;
}
