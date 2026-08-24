import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkletPaginationBackend } from '../../src/reader/runtime/worklet-pagination-backend';

const worklets = vi.hoisted(() => {
  const runtime = { name: 'LunarRitoPagination', runtimeId: 3 };
  return {
    createWorkletRuntime: vi.fn(() => runtime),
    runOnRuntimeAsync: vi.fn(),
    runtime,
  };
});

const native = vi.hoisted(() => ({
  installNativeReaderWorkletRuntime: vi.fn(),
}));

vi.mock('react-native-worklets', () => ({
  createWorkletRuntime: worklets.createWorkletRuntime,
  runOnRuntimeAsync: worklets.runOnRuntimeAsync,
}));

vi.mock('../../src/reader/native/archive-module', () => ({
  installNativeReaderWorkletRuntime: native.installNativeReaderWorkletRuntime,
}));

describe('WorkletPaginationBackend', () => {
  beforeEach(() => {
    worklets.runOnRuntimeAsync.mockReset();
    native.installNativeReaderWorkletRuntime.mockReset();
  });

  it('creates a dedicated Worker Runtime for Rito pagination', () => {
    new WorkletPaginationBackend();

    expect(worklets.createWorkletRuntime).toHaveBeenCalledWith({
      name: 'LunarRitoPagination',
      enableEventLoop: true,
    });
  });

  it('sends only serializable data after installing the direct JSI bridge', async () => {
    native.installNativeReaderWorkletRuntime.mockReturnValue(true);
    worklets.runOnRuntimeAsync
      .mockResolvedValueOnce({
        measureText: true,
        resolveFontMetrics: true,
        available: true,
      })
      .mockResolvedValueOnce({
        metadata: { title: 'Book', language: 'zh', identifier: 'book' },
        toc: [],
        layout: {},
        totalPages: 1,
        totalSpreads: 1,
        chapters: [],
        chapterTimings: [],
        tocTargets: [],
      });

    const backend = new WorkletPaginationBackend();
    const data = new ArrayBuffer(8);
    await backend.open({
      request: {
        bookId: 'book',
        fileUri: 'file:///book.epub',
        viewport: { width: 320, height: 640, pixelRatio: 2 },
        typography: {
          fontSize: 18,
          lineHeight: 1.6,
          marginHorizontal: 24,
          marginVertical: 32,
          spreadMode: 'single',
        },
        theme: 'light',
      },
      layout: {} as never,
      data,
      operationId: 1,
      revisionId: 1,
      signal: new AbortController().signal,
    });

    expect(native.installNativeReaderWorkletRuntime).toHaveBeenCalledWith(worklets.runtime);
    expect(worklets.runOnRuntimeAsync.mock.calls[1]?.[2]).toEqual({
      request: expect.any(Object),
      data,
      operationId: 1,
      revisionId: 1,
      allowApproximateMeasurement: false,
    });
  });
});
