import {
  LunarPaginationWorkerNative,
  type NativeReaderFontMetricsRequest,
  type NativeReaderTextMeasureRequest,
} from '@modules/lunar-pagination-worker';

import type {
  ReaderArchiveHandle,
  ReaderArchiveModule,
  ReaderFontMetrics,
  ReaderNativeTextMeasurer,
  ReaderTextMetrics,
} from '../contracts';

export function createNativeReaderArchiveModule(): ReaderArchiveModule | undefined {
  const native = LunarPaginationWorkerNative;
  if (!native) {
    return undefined;
  }
  return {
    async open(uri): Promise<ReaderArchiveHandle> {
      const opened = await native.openArchive(uri);
      let closed = false;
      return {
        bookHash: opened.bookHash,
        hasEntry(path) {
          return !closed && native.hasArchiveEntry(opened.handleId, path);
        },
        readEntry(path) {
          if (closed) {
            return Promise.reject(new Error('The EPUB archive handle is closed.'));
          }
          return native.readArchiveEntry(opened.handleId, path);
        },
        close() {
          if (!closed) {
            closed = true;
            native.closeArchive(opened.handleId);
          }
        },
      };
    },
  };
}

export function createNativeReaderTextMeasurer(): ReaderNativeTextMeasurer | undefined {
  const native = LunarPaginationWorkerNative;
  if (!native) {
    return undefined;
  }
  return {
    measureText(request): ReaderTextMetrics {
      return native.measureText(request as NativeReaderTextMeasureRequest);
    },
    resolveFontMetrics(request): ReaderFontMetrics {
      return native.resolveFontMetrics(request as NativeReaderFontMetricsRequest);
    },
  };
}

export function readNativeReaderBuiltinFont(): Uint8Array {
  const bytes = LunarPaginationWorkerNative?.getBuiltinFontBytes();
  if (!bytes || bytes.byteLength === 0) {
    throw new Error('The bundled Lunar reader font is unavailable from the native module.');
  }
  return bytes;
}

export function installNativeReaderWorkletRuntime(runtimeHolder: object): boolean {
  const installer = LunarPaginationWorkerNative?.installOnReaderWorkletRuntime;
  return installer ? installer(runtimeHolder) : false;
}
