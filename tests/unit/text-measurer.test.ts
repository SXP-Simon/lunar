import { describe, expect, it, vi } from 'vitest';
import type { ReaderMeasurePaint } from '../../src/reader/contracts';
import type { LunarSkiaFontRegistry } from '../../src/reader/skia/fonts/font-registry';
import {
  LunarSkiaTextMeasurer,
  type SkiaParagraphFactory,
} from '../../src/reader/skia/text';

vi.mock('@shopify/react-native-skia', () => ({
  FontSlant: { Italic: 1, Upright: 0 },
  FontWidth: { Normal: 5 },
  Skia: {},
}));

const paint: ReaderMeasurePaint = {
  font: {
    family: 'serif',
    weight: 400,
    style: 'normal',
    sizePx: 18,
  },
};

describe('LunarSkiaTextMeasurer', () => {
  it('uses the resolved SkFont for runs without custom spacing', () => {
    const font = {
      getTextWidth: vi.fn((text: string) => text.length * 9),
      getGlyphIDs: vi.fn(() => [1]),
      getMetrics: vi.fn(),
    };
    const paragraphs = createParagraphFactory();
    const measurer = createMeasurer(font, paragraphs);

    expect(measurer.measureText('日本語', paint)).toEqual({ width: 27, height: 18 });
    expect(font.getTextWidth).toHaveBeenCalledWith('日本語');
    expect(paragraphs.measureShapedText).not.toHaveBeenCalled();
  });

  it('reuses an exact text measurement without mutating the paragraph factory', () => {
    const font = {
      getTextWidth: vi.fn(() => 54),
      getGlyphIDs: vi.fn(() => [1]),
      getMetrics: vi.fn(),
    };
    const measurer = createMeasurer(font, createParagraphFactory());

    measurer.measureText('同じ本文', paint);
    measurer.measureText('同じ本文', paint);

    expect(font.getTextWidth).toHaveBeenCalledTimes(1);
  });

  it('retains Paragraph shaping for custom character spacing', () => {
    const font = {
      getTextWidth: vi.fn(() => 54),
      getGlyphIDs: vi.fn(() => [1]),
      getMetrics: vi.fn(),
    };
    const paragraphs = createParagraphFactory({ width: 61, height: 18 });
    const measurer = createMeasurer(font, paragraphs);

    expect(measurer.measureText('間隔付き', { ...paint, letterSpacingPx: 1 })).toEqual({
      width: 61,
      height: 18,
    });
    expect(font.getTextWidth).not.toHaveBeenCalled();
    expect(paragraphs.measureShapedText).toHaveBeenCalledTimes(1);
  });

  it('uses Paragraph when the resolved SkFont lacks a glyph that Paragraph will fall back to', () => {
    const font = {
      getTextWidth: vi.fn(() => 36),
      getGlyphIDs: vi.fn(() => [1, 0, 1]),
      getMetrics: vi.fn(),
    };
    const paragraphs = createParagraphFactory({ width: 54, height: 18 });
    const measurer = createMeasurer(font, paragraphs);

    expect(measurer.measureText('中文文', paint)).toEqual({ width: 54, height: 18 });
    expect(font.getTextWidth).not.toHaveBeenCalled();
    expect(paragraphs.measureShapedText).toHaveBeenCalledTimes(1);
  });
});

function createMeasurer(
  font: {
    getTextWidth(text: string): number;
    getGlyphIDs(text: string): number[];
    getMetrics(): unknown;
  },
  paragraphs: SkiaParagraphFactory,
): LunarSkiaTextMeasurer {
  const resolver = {
    resolveFont: vi.fn(() => font),
  } as unknown as LunarSkiaFontRegistry;
  return new LunarSkiaTextMeasurer(resolver, paragraphs);
}

function createParagraphFactory(metrics = { width: 0, height: 0 }): SkiaParagraphFactory {
  return {
    createParagraph: vi.fn(),
    measureShapedText: vi.fn(() => metrics),
  } as unknown as SkiaParagraphFactory;
}
