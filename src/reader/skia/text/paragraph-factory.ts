import {
  FontSlant,
  FontWidth,
  Skia,
  type SkParagraph,
  type SkTextStyle,
} from '@shopify/react-native-skia';

import type {
  ReaderMeasurePaint,
  ReaderTextMetrics,
  ReaderTextShadow,
} from '../../contracts';
import type { SkiaFontRegistry } from '../fonts/font-registry';

export interface SkiaParagraphCreateOptions {
  readonly color?: string;
  readonly alpha?: number;
  readonly textShadow?: readonly ReaderTextShadow[];
}

export interface SkiaParagraphFactory {
  createParagraph(
    text: string,
    paint: ReaderMeasurePaint,
    options?: SkiaParagraphCreateOptions,
  ): SkParagraph;
  measureShapedText(text: string, paint: ReaderMeasurePaint): ReaderTextMetrics;
}

export class LunarSkiaParagraphFactory implements SkiaParagraphFactory {
  constructor(readonly fonts: SkiaFontRegistry) {}

  createParagraph(
    text: string,
    paint: ReaderMeasurePaint,
    options: SkiaParagraphCreateOptions = {},
  ): SkParagraph {
    const families = this.fonts.getFontFamilies(paint.font.family);
    const provider = this.fonts.getParagraphProvider(paint.font.family);
    const builder = provider
      ? Skia.ParagraphBuilder.Make({}, provider)
      : Skia.ParagraphBuilder.Make({});
    const style: SkTextStyle = {
      color: colorWithAlpha(options.color ?? '#000000', options.alpha ?? 1),
      fontFamilies: families.length > 0 ? [...families] : ['sans-serif'],
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

  measureShapedText(text: string, paint: ReaderMeasurePaint): ReaderTextMetrics {
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
}

export const SINGLE_LINE_LAYOUT_WIDTH = 100_000;

function colorWithAlpha(value: string, alpha: number) {
  const color = Skia.Color(value);
  const resolved = new Float32Array(color);
  resolved[3] = (resolved[3] ?? 1) * Math.min(1, Math.max(0, alpha));
  return resolved;
}
