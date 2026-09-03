import type { ReaderColor, ReaderRect } from '../../contracts';
import { isGrayscaleColor, skiaColor } from './color-adapter';

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
  return isGrayscaleColor(original) ? override.foregroundColor : original;
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
