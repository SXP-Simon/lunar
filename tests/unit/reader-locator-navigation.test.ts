import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReaderLocator } from '../../src/reader/contracts';
import type { RitoArtifact, RitoBackgroundAdvance } from '../../modules/rito-rn/src/protocol/artifact-types';
import type { RitoArtifactRequest } from '../../modules/rito-rn/src/protocol/requests';
import { DEFAULT_READER_TYPOGRAPHY } from '../../src/reader/typography/defaults';
import { RitoNativePaginationBackend } from '../../src/reader/runtime/pagination/rito-native-pagination-backend';
import { LunarReaderRuntime } from '../../src/reader/runtime/core/native-reader-runtime';

const { openSession } = vi.hoisted(() => ({ openSession: vi.fn() }));
vi.mock('../../modules/rito-rn/src/session', () => ({ RitoReaderSession: { open: openSession } }));
vi.mock('../../src/reader/rito/pinned-font', () => ({ loadBundledLunarFontBytes: async () => new Uint8Array() }));
vi.mock('../../src/reader/skia/fonts/font-registry', () => ({
  LunarSkiaFontRegistry: class { loadBuiltinFont() {} },
}));
vi.mock('../../src/reader/skia/text/text-measurer', () => ({
  LunarSkiaTextMeasurer: class { paragraphs = {}; dispose() {} },
}));
vi.mock('../../src/reader/skia/images/image-decoder', () => ({
  SkiaImageCache: class { async acquire() { return { release() {} }; } clear() {} },
}));
vi.mock('../../src/reader/skia/rendering/picture-compiler', () => ({
  SkiaPictureCompiler: class { compile() { return {}; } dispose() {} },
}));

afterEach(() => { vi.useRealTimers(); });

function artifact(id: bigint, href: string): RitoArtifact {
  return {
    protocolVersion: 1, capabilityProfileId: 1, sessionId: 1n, requestId: id, revisionId: 1n,
    revisionVersion: 1, artifactId: id, locator: { href, sourcePoint: { nodePath: [1], textOffset: 12n } },
    matchedBy: 'source-point', localPageIndex: 0, localSpreadIndex: 0, localPageIndexes: [0],
    width: 400, height: 800, terminalExtent: true, navigation: { previous: 'available', next: 'available' },
    textProfile: 'platform-string-runs', resources: [], fonts: [],
    displayList: { formatVersion: 1, commandCount: 0, semanticDigest: new Uint8Array(), wireBytes: new Uint8Array(), displayList: { commands: [] } } as RitoArtifact['displayList'],
    pages: [{ pageIndex: 0, width: 400, height: 800, hits: [], semantics: [], text: href, textLength: 1n, textRuns: [] }],
  };
}

const target: ReaderLocator = { spineIdref: 'second', manifestHref: 'second.xhtml', chapterProgress: 0.5,
  sourcePoint: { nodePath: [1], textOffset: 12 } };

async function setup(options: { completed?: boolean; runtime?: boolean; spreadMode?: 'single' | 'double' } = {}) {
  const source = { ...artifact(1n, 'first.xhtml'),
    ...(options.completed ? { bookPageIndex: 0, bookPageCount: 100 } : {}) };
  const destination = artifact(2n, 'second.xhtml');
  const artifacts = new Map([[1n, source], [2n, destination]]);
  let visible = source;
  let nextId = 2n;
  const session = {
    get currentVisibleArtifact() { return visible; },
    get currentVisibleArtifactId() { return visible.artifactId; },
    nextRequestId: 2n,
    readPublication: async () => ({ metadata: { title: 'Book', language: 'en', identifier: 'book' }, toc: [],
      spine: [{ idref: 'first', href: 'first.xhtml' }, { idref: 'second', href: 'second.xhtml' }] }),
    getArtifact: (id: bigint) => artifacts.get(id),
    requestArtifact: vi.fn(async (request: RitoArtifactRequest) => {
      const candidate = { ...destination, artifactId: nextId++, requestId: request.requestId };
      artifacts.set(candidate.artifactId, candidate);
      return candidate;
    }),
    adoptForeground: vi.fn(async (request: { candidateArtifactId: bigint }) => { visible = artifacts.get(request.candidateArtifactId)!; }),
    advanceBackground: vi.fn(async (): Promise<RitoBackgroundAdvance> => {
      const candidate = { ...visible, artifactId: nextId++, bookPageIndex: 42, bookPageCount: 100 };
      artifacts.set(candidate.artifactId, candidate);
      return { state: 'reused', intentRequestId: visible.requestId, movesVisibleContent: false,
        replacesArtifactId: visible.artifactId, artifact: candidate };
    }),
    adoptBackground: vi.fn(async (request: { candidateArtifactId: bigint }) => { visible = artifacts.get(request.candidateArtifactId)!; }),
    releaseArtifact: vi.fn(async (id: bigint) => { artifacts.delete(id); }),
    dispose: vi.fn(async () => undefined),
  };
  openSession.mockResolvedValue({ session, artifact: source });
  const backend = new RitoNativePaginationBackend({ initialHref: 'first.xhtml', pinnedFonts: [] });
  const layout = { typography: { ...DEFAULT_READER_TYPOGRAPHY, spreadMode: options.spreadMode ?? 'single' }, theme: 'light' as const, viewport: { width: 400, height: 800, pixelRatio: 1 } };
  const request = { ...layout, bookId: 'book', fileUri: 'book.epub' };
  const runtime = new LunarReaderRuntime(async () => new ArrayBuffer(0), backend);
  if (options.runtime) {
    const open = vi.spyOn(backend, 'open');
    await runtime.open(request);
    const { publication } = await open.mock.results[0].value;
    return { backend, publication, session, destination, runtime };
  }
  const { publication } = await backend.open({ request, layout,
    data: new ArrayBuffer(0), revisionId: 1, operationId: 1, signal: new AbortController().signal });
  return { backend, publication, session, destination, runtime };
}

describe('saved reader location navigation', () => {
  it('sends only the start point for a highlight with both saved selectors', async () => {
    const { backend, publication, session } = await setup();
    const range = { start: target.sourcePoint!, end: { nodePath: [2], textOffset: 20 } };
    await publication.resolveLocator!({ ...target, sourceRange: range });
    const [request] = session.requestArtifact.mock.calls[0];
    expect(request.locator.sourcePoint).toEqual({ nodePath: [1], textOffset: 12n });
    expect(request.locator.sourceRange).toBeUndefined();
    await backend.close();
  });

  it.each(['toc', 'bookmark', 'highlight'] as const)('retains the completed total after a %s jump', async (kind) => {
    const { backend, publication } = await setup({ completed: true });
    if (kind === 'toc') await publication.resolveToc('second.xhtml');
    else await publication.resolveLocator!({ ...target, ...(kind === 'highlight' ? {
      sourceRange: { start: target.sourcePoint!, end: { nodePath: [2], textOffset: 20 } },
    } : {}) });
    expect(publication.totalSpreads).toBe(100);
    expect(publication.getBookPageIndex!(0)).toBeUndefined();
    await backend.close();
  });

  it.each(['single', 'double'] as const)('restores book page numbers after repeated jumps in %s mode', async (spreadMode) => {
    vi.useFakeTimers();
    const { runtime, publication, session } = await setup({ completed: true, runtime: true, spreadMode });
    const total = spreadMode === 'double' ? 50 : 100;
    const bookSpreadIndex = spreadMode === 'double' ? 21 : 42;
    try {
      expect(runtime.getSnapshot()).toMatchObject({ totalSpreads: total, paginationComplete: true });
      for (const navigate of [
        () => runtime.goToToc('second.xhtml'),
        () => runtime.goToLocator(target),
        () => runtime.goToLocator({ ...target, sourceRange: { start: target.sourcePoint!, end: { nodePath: [2], textOffset: 20 } } }),
      ]) {
        const snapshot = await navigate();
        expect(snapshot.paginationComplete).toBe(false);
        expect(snapshot.bookSpreadIndex).toBeUndefined();
        expect(publication.totalSpreads).toBe(total);
        await vi.advanceTimersByTimeAsync(32);
        expect(runtime.getSnapshot()).toMatchObject({ totalSpreads: total, bookSpreadIndex });
        session.advanceBackground.mockResolvedValueOnce({ state: 'complete', movesVisibleContent: false,
          intentRequestId: 2n, replacesArtifactId: 0n });
        await vi.advanceTimersByTimeAsync(32);
        expect(runtime.getSnapshot().paginationComplete).toBe(true);
      }
      expect(session.adoptBackground).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(96);
      expect(session.advanceBackground).toHaveBeenCalledTimes(6);
    } finally { await runtime.close(); }
  });

  it('preserves completed page numbers when a saved-location jump fails', async () => {
    vi.useFakeTimers();
    const { runtime, session } = await setup({ completed: true, runtime: true });
    try {
      const source = runtime.getSnapshot();
      session.adoptForeground.mockRejectedValueOnce(new Error('adoption failed'));
      await expect(runtime.goToLocator(target)).rejects.toThrow('adoption failed');
      expect(runtime.getSnapshot()).toBe(source);
      await vi.advanceTimersByTimeAsync(96);
      expect(session.advanceBackground).not.toHaveBeenCalled();
    } finally { await runtime.close(); }
  });

  it('requests exact source coordinates across chapters and publishes the prepared frame', async () => {
    const { backend, publication, session } = await setup();
    expect(await publication.resolveLocator!(target)).toBe(0);
    expect(session.requestArtifact).toHaveBeenCalledWith(expect.objectContaining({
      locator: expect.objectContaining({ href: 'second.xhtml', sourcePoint: { nodePath: [1], textOffset: 12n } }),
    }));
    expect(publication.getCurrentLocator!(0)?.manifestHref).toBe('second.xhtml');
    expect(publication.getFrame(0)?.text).toBe('second.xhtml');
    expect(session.releaseArtifact).toHaveBeenCalledWith(1n);
    await backend.close();
  });

  it('keeps the visible source frame until candidate adoption succeeds', async () => {
    const { backend, publication, session } = await setup();
    const adopt = session.adoptForeground.getMockImplementation()!;
    session.adoptForeground.mockImplementationOnce(async (request) => {
      expect(publication.getFrame(0)?.text).toBe('first.xhtml');
      expect(publication.getCurrentLocator!(0)?.manifestHref).toBe('first.xhtml');
      await adopt(request);
    });
    await publication.resolveLocator!(target);
    expect(publication.getFrame(0)?.text).toBe('second.xhtml');
    await backend.close();
  });

  it('restores the source slot and releases the candidate after failed adoption', async () => {
    const { backend, publication, session } = await setup();
    session.adoptForeground.mockRejectedValueOnce(new Error('adoption failed'));
    await expect(publication.resolveLocator!(target)).rejects.toThrow('adoption failed');
    expect(publication.getFrame(0)?.text).toBe('first.xhtml');
    expect(publication.getCurrentLocator!(0)?.manifestHref).toBe('first.xhtml');
    expect(session.releaseArtifact).toHaveBeenCalledWith(2n);
    expect(session.releaseArtifact).not.toHaveBeenCalledWith(1n);
    await backend.close();
  });

  it('leaves the page intact when the saved chapter is missing', async () => {
    const { backend, publication, session } = await setup();
    expect(await publication.resolveLocator!({ ...target, manifestHref: 'missing.xhtml' })).toBeUndefined();
    expect(session.requestArtifact).not.toHaveBeenCalled();
    expect(publication.getFrame(0)?.text).toBe('first.xhtml');
    await backend.close();
  });
});
