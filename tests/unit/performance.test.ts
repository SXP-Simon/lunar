import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isReaderPerformanceEnabled,
  isReaderTraceEnabled,
  readerDiagnostic,
  readerPerformanceMark,
} from '../../src/reader/runtime/core/performance';

afterEach(() => {
  delete globalThis.LUNAR_READER_PERF;
  delete globalThis.LUNAR_READER_TRACE;
  delete globalThis.__LUNAR_READER_PERF__;
  vi.restoreAllMocks();
});

describe('reader performance diagnostics', () => {
  it('accepts the short console flag name', () => {
    globalThis.LUNAR_READER_PERF = true;
    expect(isReaderPerformanceEnabled()).toBe(true);
    expect(isReaderTraceEnabled()).toBe(false);
  });

  it('allows trace logging to be enabled independently', () => {
    globalThis.LUNAR_READER_TRACE = true;
    expect(isReaderPerformanceEnabled()).toBe(false);
    expect(isReaderTraceEnabled()).toBe(true);
  });

  it('keeps logging failures away from reader operations', () => {
    globalThis.LUNAR_READER_PERF = true;
    globalThis.LUNAR_READER_TRACE = true;
    vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('debugger logging failed');
    });

    expect(() => readerPerformanceMark('reader.test')).not.toThrow();
    expect(() => readerDiagnostic('reader.test')).not.toThrow();
  });
});
