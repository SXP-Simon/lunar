import { describe, expect, it, vi } from 'vitest';

import type { ReaderMeasurePaint } from '../../src/reader/contracts';
import type { ReaderNativeTextMeasurer } from '../../src/reader/contracts/archive';
import { NativePaginationTextMeasurer } from '../../src/reader/runtime/native-text-measurer';

const paint: ReaderMeasurePaint = {
  font: {
    family: 'serif',
    weight: 400,
    style: 'normal',
    sizePx: 18,
  },
};

describe('NativePaginationTextMeasurer', () => {
  it('forwards system-font measurements to the platform text measurer', () => {
    const native = createNativeMeasurer();
    const fallback = createFallback();
    const measurer = new NativePaginationTextMeasurer(native, fallback, () => true);

    expect(measurer.measureText('中文文', paint)).toEqual({ width: 54, height: 18 });
    expect(native.measureText).toHaveBeenCalledWith({
      text: '中文文',
      family: 'serif',
      weight: 400,
      style: 'normal',
      sizePx: 18,
      letterSpacingPx: undefined,
      wordSpacingPx: undefined,
    });
    expect(fallback.measureText).not.toHaveBeenCalled();
  });

  it('keeps EPUB embedded fonts on the Skia fallback measurer', () => {
    const native = createNativeMeasurer();
    const fallback = createFallback();
    const measurer = new NativePaginationTextMeasurer(native, fallback, () => false);

    expect(measurer.measureText('本文', paint)).toEqual({ width: 40, height: 18 });
    expect(native.measureText).not.toHaveBeenCalled();
    expect(fallback.measureText).toHaveBeenCalledWith('本文', paint);
  });

  it('caches duplicate system-font measurements before crossing the native bridge', () => {
    const native = createNativeMeasurer();
    const measurer = new NativePaginationTextMeasurer(native, createFallback(), () => true);

    measurer.measureText('中文文', paint);
    measurer.measureText('中文文', paint);

    expect(native.measureText).toHaveBeenCalledTimes(1);
  });
});

function createNativeMeasurer(): ReaderNativeTextMeasurer {
  return {
    measureText: vi.fn(() => ({ width: 54, height: 18 })),
    resolveFontMetrics: vi.fn(() => ({
      ascentPx: 14,
      descentPx: 4,
      lineGapPx: 0,
      contentHeightPx: 18,
    })),
  };
}

function createFallback() {
  return {
    measureText: vi.fn(() => ({ width: 40, height: 18 })),
    resolveFontMetrics: vi.fn(() => ({
      ascentPx: 14,
      descentPx: 4,
      lineGapPx: 0,
      contentHeightPx: 18,
    })),
  };
}
