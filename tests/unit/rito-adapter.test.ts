import { describe, expect, it } from 'vitest';

import {
  LUNAR_ZIP_LIMITS,
  RITO_VERSION,
  loadRitoDocument,
} from '../../src/reader/rito/rito-adapter';

describe('Rito adapter', () => {
  it('pins the reader engine and archive limits', () => {
    expect(RITO_VERSION).toBe('0.13.0');
    expect(LUNAR_ZIP_LIMITS.maxArchiveBytes).toBe(100 * 1024 * 1024);
    expect(LUNAR_ZIP_LIMITS.maxCompressionRatio).toBe(100);
  });

  it('rejects an empty archive', () => {
    expect(() => loadRitoDocument(new ArrayBuffer(0))).toThrow();
  });
});
