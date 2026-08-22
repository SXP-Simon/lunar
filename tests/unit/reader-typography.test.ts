import { describe, expect, it } from 'vitest';

import {
  createReaderTypographyKey,
  normalizeReaderTypography,
  type ReaderTypography,
} from '../../src/reader';

const typography: ReaderTypography = {
  fontFamily: '  Source Han Serif  ',
  fontSize: 18,
  lineHeight: 1.65,
  marginHorizontal: 24,
  marginVertical: 36,
  spreadMode: 'single',
};

describe('reader typography', () => {
  it('normalizes the font family before creating a layout key', () => {
    expect(normalizeReaderTypography(typography).fontFamily).toBe('Source Han Serif');
    expect(createReaderTypographyKey(typography)).toBe(
      '["Source Han Serif",18,1.65,24,36,"single"]',
    );
  });

  it('rejects dimensions that cannot produce a valid layout', () => {
    expect(() =>
      normalizeReaderTypography({ ...typography, fontSize: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeReaderTypography({ ...typography, marginVertical: -1 }),
    ).toThrow(RangeError);
  });
});
