import { describe, expect, it, vi } from 'vitest';
import { WorkletPaginationBackend } from '../../src/reader/runtime/worklet-pagination-backend';

const worklets = vi.hoisted(() => {
  const runtime = { name: 'LunarRitoPagination', runtimeId: 3 };
  return {
    createWorkletRuntime: vi.fn(() => runtime),
    runtime,
  };
});

vi.mock('react-native-worklets', () => ({
  createWorkletRuntime: worklets.createWorkletRuntime,
  runOnRuntimeAsync: vi.fn(),
}));

vi.mock('../../src/reader/native/archive-module', () => ({
  createNativeReaderWorkletBindings: vi.fn(),
  installNativeReaderWorkletRuntime: vi.fn(),
}));

describe('WorkletPaginationBackend', () => {
  it('creates a dedicated Worker Runtime for Rito pagination', () => {
    new WorkletPaginationBackend();

    expect(worklets.createWorkletRuntime).toHaveBeenCalledWith({
      name: 'LunarRitoPagination',
      enableEventLoop: true,
    });
  });
});
