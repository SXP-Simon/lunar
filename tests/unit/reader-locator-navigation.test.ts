import { describe, expect, it, vi } from 'vitest';
import type { ReaderLocator } from '../../src/reader/contracts';
import type { RitoArtifact } from '../../modules/rito-rn/src/protocol/artifact-types';
import { DEFAULT_READER_TYPOGRAPHY } from '../../src/reader/typography/defaults';
import { RitoNativePaginationBackend } from '../../src/reader/runtime/pagination/rito-native-pagination-backend';

const { openSession } = vi.hoisted(() => ({ openSession: vi.fn() }));
vi.mock('../../modules/rito-rn/src/session', () => ({ RitoReaderSession: { open: openSession } }));

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

async function setup() {
  const source = artifact(1n, 'first.xhtml');
  const destination = artifact(2n, 'second.xhtml');
  const artifacts = new Map([[1n, source], [2n, destination]]);
  let visible = source;
  const session = {
    get currentVisibleArtifact() { return visible; },
    get currentVisibleArtifactId() { return visible.artifactId; },
    nextRequestId: 2n,
    readPublication: async () => ({ metadata: { title: 'Book', language: 'en', identifier: 'book' }, toc: [],
      spine: [{ idref: 'first', href: 'first.xhtml' }, { idref: 'second', href: 'second.xhtml' }] }),
    getArtifact: (id: bigint) => artifacts.get(id),
    requestArtifact: vi.fn(async () => destination),
    adoptForeground: vi.fn(async () => { visible = destination; }),
    releaseArtifact: vi.fn(async (id: bigint) => { artifacts.delete(id); }),
    dispose: vi.fn(async () => undefined),
  };
  openSession.mockResolvedValue({ session, artifact: source });
  const backend = new RitoNativePaginationBackend({ initialHref: 'first.xhtml', pinnedFonts: [] });
  const layout = { typography: DEFAULT_READER_TYPOGRAPHY, theme: 'light' as const, viewport: { width: 400, height: 800, pixelRatio: 1 } };
  const { publication } = await backend.open({ request: { ...layout, bookId: 'book', fileUri: 'book.epub' }, layout,
    data: new ArrayBuffer(0), revisionId: 1, operationId: 1, signal: new AbortController().signal });
  return { backend, publication, session, destination };
}

describe('saved reader location navigation', () => {
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
    session.adoptForeground.mockImplementationOnce(async () => {
      expect(publication.getFrame(0)?.text).toBe('first.xhtml');
      expect(publication.getCurrentLocator!(0)?.manifestHref).toBe('first.xhtml');
      await adopt();
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
