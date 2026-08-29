import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isReaderPerformanceEnabled,
  isReaderTraceEnabled,
  isReaderVerboseTraceEnabled,
  readerDiagnostic,
  readerPerformanceEnd,
  readerPerformanceStart,
  readerPerformanceMark,
} from '../../src/reader/runtime/core/performance';

afterEach(() => {
  delete globalThis.LUNAR_READER_PERF;
  delete globalThis.LUNAR_READER_TRACE;
  delete globalThis.LUNAR_READER_TRACE_VERBOSE;
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

  it('keeps the default trace focused on navigation and failures', () => {
    globalThis.LUNAR_READER_TRACE = true;
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    readerDiagnostic('runtime.show.ready', 'spread=2');
    readerDiagnostic('bg.result', 'state=advanced');
    readerDiagnostic('frame.reject', 'spread=2');

    expect(info.mock.calls.map(([message]) => message)).toEqual([
      '[LunarReader][trace] runtime.show.ready spread=2',
      '[LunarReader][trace] frame.reject spread=2',
    ]);
  });

  it('exposes verbose trace only when explicitly enabled', () => {
    globalThis.LUNAR_READER_TRACE = true;
    globalThis.LUNAR_READER_TRACE_VERBOSE = true;
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(isReaderVerboseTraceEnabled()).toBe(true);
    readerDiagnostic('bg.result', 'state=advanced');

    expect(info).toHaveBeenCalledWith('[LunarReader][trace] bg.result state=advanced');
  });

  it('reports selected performance summaries without start/end noise', () => {
    globalThis.LUNAR_READER_PERF = true;
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const startedAt = readerPerformanceStart('reader.picture.compile');
    readerPerformanceEnd('reader.picture.compile', startedAt);
    readerPerformanceMark('reader.firstReadySnapshot', 'spread=0');

    expect(info.mock.calls.map(([message]) => message)).toEqual([
      '[LunarReader][perf] reader.firstReadySnapshot spread=0',
    ]);
  });
});
