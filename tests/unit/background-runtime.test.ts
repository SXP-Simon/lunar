import { describe, expect, it } from 'vitest';

import {
  createReaderLayoutFingerprint,
  FallbackPaginationBackend,
  isCurrentReaderResponse,
  MemoryReaderPaginationSnapshotCache,
  validatePaginationSnapshot,
} from '../../src/reader';
import type {
  LoadedReaderPublication,
  ReaderPaginationBackend,
  ReaderPaginationBackendOpenOptions,
  ReaderRenderFrame,
} from '../../src/reader';
import type { ReaderPaginationSnapshot } from '../../src/reader/runtime/pagination-cache';
import {
  openReaderPagination,
  probeReaderWorkerNativeBridge,
} from '../../src/reader/runtime/reader-pagination-worker';

describe('reader background runtime protocol', () => {
  it('creates a stable layout fingerprint independent of object key order', () => {
    const first = createReaderLayoutFingerprint({
      bookHash: 'book',
      ritoVersion: '0.13.0',
      rendererVersion: 'skia',
      fontFingerprint: 'system',
      layout: {
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
    });
    const second = createReaderLayoutFingerprint({
      layout: {
        theme: 'light',
        typography: {
          spreadMode: 'single',
          marginVertical: 32,
          marginHorizontal: 24,
          lineHeight: 1.6,
          fontSize: 18,
        },
        viewport: { pixelRatio: 2, height: 640, width: 320 },
      },
      fontFingerprint: 'system',
      rendererVersion: 'skia',
      ritoVersion: '0.13.0',
      bookHash: 'book',
    });
    expect(first).toBe(second);
  });

  it('drops stale responses and retains only recent snapshots', () => {
    expect(isCurrentReaderResponse({ operationId: 2, revisionId: 3 }, 2, 3)).toBe(true);
    expect(isCurrentReaderResponse({ operationId: 1, revisionId: 3 }, 2, 3)).toBe(false);

    const cache = new MemoryReaderPaginationSnapshotCache(1);
    const snapshot = createSnapshot('one');
    cache.set(snapshot);
    expect(cache.get('one')).toBe(snapshot);
    cache.set(createSnapshot('two'));
    expect(cache.get('one')).toBeUndefined();
    expect(validatePaginationSnapshot(createSnapshot('two'))).toBe(true);
  });

  it('switches to the local backend when the Worklet loses its frame state', async () => {
    const events: string[] = [];
    const primary = new FakeBackend({ frameError: new Error('worker stopped') });
    const fallback = new FakeBackend({ frame: createFrame(4) });
    const backend = new FallbackPaginationBackend(primary, fallback, ({ phase }) => {
      events.push(phase);
    });

    await backend.open(createOpenOptions());
    const frame = await backend.getFrame(1, 4);

    expect(frame?.spreadIndex).toBe(4);
    expect(events).toEqual(['get-frame']);
    expect(fallback.openCount).toBe(1);
  });

  it('continues cleanup when one backend close rejects', async () => {
    const primary = new FakeBackend({ closeError: new Error('worker already gone') });
    const fallback = new FakeBackend();
    const backend = new FallbackPaginationBackend(primary, fallback);

    await expect(backend.close()).resolves.toBeUndefined();
    expect(fallback.closeCount).toBe(1);
  });

  it('rejects Worker pagination when native measurement is unavailable', async () => {
    await expect(
      openReaderPagination({ allowApproximateMeasurement: false } as never),
    ).rejects.toMatchObject({ name: 'ReaderNativeWorkerUnavailableError' });
  });

  it('reports the missing Expo SharedObject installation before serialization', () => {
    expect(probeReaderWorkerNativeBridge()).toEqual({
      sharedObjectClass: false,
      resolver: false,
      available: false,
    });
  });

});

function createOpenOptions(): ReaderPaginationBackendOpenOptions {
  return {
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
    layout: {
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
    data: new ArrayBuffer(0),
    revisionId: 1,
    operationId: 1,
    signal: new AbortController().signal,
  };
}

function createFrame(spreadIndex: number): ReaderRenderFrame {
  return {
    spreadIndex,
    pageIndices: [spreadIndex],
    width: 320,
    height: 640,
    imageSources: [],
    displayList: { width: 320, height: 640, commands: [] },
  };
}

class FakeBackend implements ReaderPaginationBackend {
  openCount = 0;
  closeCount = 0;

  constructor(
    private readonly behavior: {
      readonly frame?: ReaderRenderFrame;
      readonly frameError?: Error;
      readonly closeError?: Error;
    } = {},
  ) {}

  async open(options: ReaderPaginationBackendOpenOptions) {
    this.openCount += 1;
    return {
      publication: new FakePublication(this.behavior.frame),
      operationId: options.operationId,
      revisionId: options.revisionId,
    };
  }

  async getFrame() {
    if (this.behavior.frameError) {
      throw this.behavior.frameError;
    }
    return this.behavior.frame;
  }

  async cancel() {}

  async close() {
    this.closeCount += 1;
    if (this.behavior.closeError) {
      throw this.behavior.closeError;
    }
  }
}

class FakePublication implements LoadedReaderPublication {
  metadata = { title: 'Book', language: 'zh', identifier: 'id' };
  toc = [];
  layout = createOpenOptions().layout as never;
  totalPages = 1;
  totalSpreads = 1;
  chapters = [];
  chapterTimings = [];

  constructor(private readonly frame?: ReaderRenderFrame) {}

  getFrame() { return this.frame; }
  getImage() { return undefined; }
  resolveToc() { return undefined; }
  close() {}
}

function createSnapshot(cacheKey: string): ReaderPaginationSnapshot {
  return {
    cacheKey,
    createdAt: 1,
    metadata: {
      title: 'Book',
      language: 'zh',
      identifier: 'id',
    },
    toc: [],
    layout: {
      viewportWidth: 320,
      viewportHeight: 640,
      pageWidth: 320,
      pageHeight: 640,
      pixelRatio: 2,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      spreadMode: 'single',
      spreadGap: 0,
      rootFontSize: 18,
      palette: {
        backgroundColor: '#fff',
        foregroundColor: '#000',
        spreadBodyBackgroundColor: '#fff',
      },
    },
    totalPages: 1,
    totalSpreads: 1,
    chapters: [],
    chapterTimings: [],
    tocTargets: [],
  };
}
