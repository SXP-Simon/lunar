import { describe, expect, it, vi } from 'vitest';

vi.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Color: (value: string) => parseColor(value),
  },
}));

import {
  declaredGroundFor,
  effectiveTextColor,
  isBookOwnedPageGround,
} from '../../src/reader/skia/rendering/color-override';
import { skiaColor } from '../../src/reader/skia/rendering/color-adapter';

describe('Skia reader color override', () => {
  it('distinguishes a designed dark page from white paper', () => {
    expect(isBookOwnedPageGround('#111111')).toBe(true);
    expect(isBookOwnedPageGround('#ffffff')).toBe(false);
  });

  it('replaces unreadable achromatic ink on the theme ground', () => {
    expect(effectiveTextColor('#111111', {
      backgroundColor: '#000000',
      foregroundColor: '#ffffff',
    })).toBe('#ffffff');
  });

  it('preserves the typesetter color when a declared ground contains the run', () => {
    const ground = declaredGroundFor(
      { x: 10, y: 10, width: 20, height: 10 },
      undefined,
      [{ rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#222222' }],
      undefined,
    );
    expect(effectiveTextColor('#333333', {
      backgroundColor: '#000000', foregroundColor: '#ffffff',
    }, ground)).toBe('#333333');
  });

  it('converts typed linear and wide-gamut colors onto the sRGB surface', () => {
    const linear = skiaColor({
      space: 'srgb-linear', components: [1, 0, 0], alpha: 1,
      none: { component0: false, component1: false, component2: false, alpha: false },
    });
    const p3 = skiaColor({
      space: 'display-p3', components: [1, 0, 0], alpha: 1,
      none: { component0: false, component1: false, component2: false, alpha: false },
    });
    expect(linear[0]).toBe(1);
    expect(p3[0]).toBeGreaterThan(0.9);
    expect(p3[3]).toBe(1);
  });
});

function parseColor(value: string): Float32Array {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const channels = hex.length === 3
      ? [...hex].map((part) => Number.parseInt(part + part, 16))
      : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((part) => Number.parseInt(part, 16));
    return new Float32Array([channels[0] / 255, channels[1] / 255, channels[2] / 255, 1]);
  }
  const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  return new Float32Array([numbers[0] / 255, numbers[1] / 255, numbers[2] / 255, numbers[3] ?? 1]);
}
