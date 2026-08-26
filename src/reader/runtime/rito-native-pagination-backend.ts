import type {
  LoadedReaderPublication, ReaderFontRegistry, ReaderImageDecoder, ReaderLayoutRequest, ReaderOpenRequest, ReaderRenderFrame,
} from '../contracts';
import { toReaderV1DisplayList } from '../rito';
import { discoverReaderInitialSpineHref } from '../rito/epub-inspector';
import type { RitoNativePinnedFontFace, RitoArtifact, RitoLayoutRequest, RitoNativeReaderModule } from '../rito/rito-native';
import type { RitoReaderSession } from '../../../modules/rito-rn/src/session';
import type { RitoPublication, RitoTocEntry } from '../../../modules/rito-rn/src/protocol/artifact-types';
import type { ReaderBackgroundPaginationBackend, ReaderPaginationBackendOpenOptions, ReaderPaginationBackendResult } from './pagination-backend';

export interface RitoNativePaginationBackendOptions {
  readonly initialHref?: string;
  readonly pinnedFonts: readonly RitoNativePinnedFontFace[] | ((data: Uint8Array) => Promise<readonly RitoNativePinnedFontFace[]>);
  readonly native?: RitoNativeReaderModule;
}

/**
 * Rito 1.0 pagination backend. It keeps the native artifact as the source of
 * truth and materializes only the resources referenced by the active artifact.
 * The initial EPUB spine href is resolved from the package document because
 * Rito's request contract intentionally requires an explicit locator.
 */
export class RitoNativePaginationBackend implements ReaderBackgroundPaginationBackend {
  private session?: RitoReaderSession;
  private publication?: RitoNativePublication;
  private operationId?: number;
  private revisionId?: number;

  constructor(private readonly config: RitoNativePaginationBackendOptions) {}

  async open(options: ReaderPaginationBackendOpenOptions): Promise<ReaderPaginationBackendResult> {
    await this.close();
    const initialHref = this.config.initialHref ?? discoverReaderInitialSpineHref(new Uint8Array(options.data));
    const pinnedFonts = typeof this.config.pinnedFonts === 'function'
      ? await this.config.pinnedFonts(new Uint8Array(options.data))
      : this.config.pinnedFonts;
    const request = createArtifactRequest(options.request, options.layout, options.revisionId, options.operationId, initialHref);
    const { RitoReaderSession } = await import('../../../modules/rito-rn/src/session');
    const opened = await RitoReaderSession.open(new Uint8Array(options.data), request, pinnedFonts, { native: this.config.native });
    const publicationMetadata = await opened.session.readPublication();
    const publication = new RitoNativePublication(opened.session, opened.artifact, publicationMetadata, options.fontRegistry, options.imageDecoder);
    await publication.prepare(opened.artifact);
    this.session = opened.session;
    this.publication = publication;
    this.operationId = options.operationId;
    this.revisionId = options.revisionId;
    return { publication, operationId: options.operationId, revisionId: options.revisionId };
  }

  async getFrame(revisionId: number, spreadIndex: number): Promise<ReaderRenderFrame | undefined> {
    if (revisionId !== this.revisionId || !this.publication) return undefined;
    await this.publication.ensureFrame(spreadIndex);
    return this.publication.getFrame(spreadIndex);
  }

  async advanceBackground(maxTopLevelNodesPerQuantum: number): Promise<unknown> {
    if (!this.publication) throw new Error('Rito native publication is not open.');
    return this.publication.advanceBackground(maxTopLevelNodesPerQuantum);
  }

  async cancel(operationId: number, revisionId: number): Promise<void> {
    if (this.operationId === operationId && this.revisionId === revisionId) await this.close();
  }

  async close(): Promise<void> {
    const publication = this.publication;
    this.publication = undefined;
    this.operationId = undefined;
    this.revisionId = undefined;
    this.session = undefined;
    await publication?.close();
  }
}

class RitoNativePublication implements LoadedReaderPublication {
  private readonly frames = new Map<number, ReaderRenderFrame>();
  private readonly artifacts = new Map<number, RitoArtifact>();
  private readonly images = new Map<string, Uint8Array>();
  private closed = false;
  private nextRequestId: bigint;
  private visibleArtifactId?: bigint;
  private readonly metadataValue: LoadedReaderPublication['metadata'];
  private readonly tocValue: LoadedReaderPublication['toc'];
  private readonly spine: RitoPublication['spine'];

  constructor(private readonly session: RitoReaderSession, first: RitoArtifact, publication: RitoPublication, private readonly fonts?: ReaderFontRegistry, private readonly imageDecoder?: ReaderImageDecoder) {
    this.nextRequestId = first.requestId;
    this.metadataValue = publication.metadata;
    this.tocValue = publication.toc.map(toReaderToc);
    this.spine = publication.spine;
    this.visibleArtifactId = first.artifactId;
    this.artifacts.set(first.localSpreadIndex, first);
  }

  async prepare(artifact: RitoArtifact): Promise<void> {
    if (this.frames.has(artifact.localSpreadIndex)) return;
    for (const font of artifact.fonts) {
      if (!this.fonts) break;
      const resource = await this.session.readResource(artifact.artifactId, 1, font.href);
      await this.fonts.loadFont({ family: font.family, src: font.href, bytes: resource.bytes, weight: String(font.weight), style: font.style, fingerprint: font.shapeFingerprint, byteLength: Number(font.byteLength) });
    }
    for (const resource of artifact.resources) {
      if (resource.kind !== 'image') continue;
      const image = await this.session.readResource(artifact.artifactId, 0, resource.href);
      this.images.set(resource.href, image.bytes);
    }
    const display = toReaderV1DisplayList(artifact.displayList.displayList, artifact.width, artifact.height);
    const pages = artifact.pages.filter((page) => artifact.localPageIndexes.includes(page.pageIndex));
    this.frames.set(artifact.localSpreadIndex, {
      spreadIndex: artifact.localSpreadIndex,
      pageIndices: artifact.localPageIndexes,
      width: artifact.width,
      height: artifact.height,
      imageSources: [...this.images.keys()],
      displayList: display,
      hits: pages.flatMap((page) => page.hits.map((hit) => ({
        pageIndex: hit.pageIndex,
        bounds: hit.bounds,
        text: hit.text,
        href: hit.href,
        imageSource: hit.imageSrc,
        imageAlt: hit.imageAlt,
        footnoteKey: hit.footnoteKey,
        footnotePending: hit.footnotePending,
      }))),
      semantics: pages.flatMap((page) => page.semantics.map(toReaderSemanticNode)),
      text: pages.map((page) => page.text).join(''),
    });
  }

  getFrame(spreadIndex: number): ReaderRenderFrame | undefined {
    return this.frames.get(spreadIndex);
  }

  async ensureFrame(spreadIndex: number): Promise<void> {
    const existing = this.frames.get(spreadIndex);
    if (existing) return;
    const current = this.artifacts.get(this.visibleSpreadIndex());
    if (!current || Math.abs(spreadIndex - current.localSpreadIndex) !== 1) return;
    const artifact = await this.session.requestAdjacent({ sessionId: current.sessionId, requestId: ++this.nextRequestId, fromArtifactId: current.artifactId, direction: spreadIndex > current.localSpreadIndex ? 'next' : 'previous', work: { maxTopLevelNodesPerQuantum: 64, maxForegroundQuanta: 8, localPageCap: 64 } });
    await this.prepare(artifact);
    await this.session.adoptForeground({ sessionId: current.sessionId, expectedVisibleArtifactId: current.artifactId, candidateArtifactId: artifact.artifactId });
    this.artifacts.set(artifact.localSpreadIndex, artifact);
    this.visibleArtifactId = artifact.artifactId;
    return;
  }
  getImage(source: string): Uint8Array | undefined { return this.images.get(source); }
  get metadata() { return this.metadataValue; }
  get toc() { return this.tocValue; }
  get layout() { const frame = this.frames.values().next().value as ReaderRenderFrame | undefined; return { viewportWidth: frame?.width ?? 0, viewportHeight: frame?.height ?? 0, pageWidth: frame?.width ?? 0, pageHeight: frame?.height ?? 0, pixelRatio: 1, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, spreadMode: 'single' as const, spreadGap: 0, rootFontSize: 16, palette: { backgroundColor: '#000000', foregroundColor: '#ffffff', spreadBodyBackgroundColor: '#000000' } }; }
  get totalPages() { return Math.max(1, [...this.artifacts.values()].reduce((max, artifact) => Math.max(max, artifact.bookPageCount ?? artifact.localPageIndex + 1), 0)); }
  get totalSpreads() { return Math.max(1, this.frames.size); }
  get chapters() {
    return this.spine.map((item) => {
      const pages = [...this.artifacts.values()].filter((artifact) => artifact.locator.href === item.href || artifact.locator.href.startsWith(`${item.href}#`));
      if (pages.length === 0) return undefined;
      const startPage = Math.min(...pages.map((artifact) => artifact.bookPageIndex ?? artifact.localPageIndex));
      const endPage = Math.max(...pages.map((artifact) => (artifact.bookPageIndex ?? artifact.localPageIndex) + artifact.localPageIndexes.length - 1));
      return { spineIdref: item.idref, startPage, endPage };
    }).filter((range): range is { spineIdref: string; startPage: number; endPage: number } => range !== undefined);
  }
  get chapterTimings() { return []; }
  resolveToc(href: string): number | undefined {
    const base = href.split('#', 1)[0];
    const target = findTocTarget(this.tocValue, href, base);
    const targetBase = target?.split('#', 1)[0] ?? base;
    const targetAnchor = target?.includes('#') ? target.slice(target.indexOf('#') + 1) : undefined;
    return [...this.artifacts.values()].find((artifact) =>
      (artifact.locator.href === targetBase || artifact.locator.href === href) &&
      (!targetAnchor || artifact.locator.anchorId === targetAnchor),
    )?.localSpreadIndex;
  }

  private visibleSpreadIndex(): number { for (const [index, artifact] of this.artifacts) if (artifact.artifactId === this.visibleArtifactId) return index; return 0; }

  async advanceBackground(maxTopLevelNodesPerQuantum: number): Promise<import('../../../modules/rito-rn/src/protocol/artifact-types').RitoBackgroundAdvance> {
    if (!this.visibleArtifactId) throw new Error('Rito background pagination requires a visible artifact.');
    const current = this.artifacts.get(this.visibleSpreadIndex());
    if (!current) throw new Error('Rito visible artifact is unavailable.');
    const advance = await this.session.advanceBackground({ sessionId: current.sessionId, expectedVisibleArtifactId: current.artifactId, maxTopLevelNodesPerQuantum });
    if (advance.artifact) {
      await this.prepare(advance.artifact);
      this.artifacts.set(advance.artifact.localSpreadIndex, advance.artifact);
      const current = this.artifacts.get(this.visibleSpreadIndex());
      if (current) {
        await this.session.adoptBackground({ sessionId: current.sessionId, expectedVisibleArtifactId: current.artifactId, candidateArtifactId: advance.artifact.artifactId });
        this.visibleArtifactId = advance.artifact.artifactId;
      }
    }
    return advance;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const artifact of this.artifacts.values()) await this.session.releaseArtifact(artifact.artifactId).catch(() => undefined);
    await this.session.dispose();
  }
}

function toReaderToc(entry: RitoTocEntry): import('../contracts').ReaderTocEntry {
  const target = entry.target.kind === 'locator'
    ? `${entry.target.locator.href}${entry.target.locator.anchorId ? `#${entry.target.locator.anchorId}` : ''}`
    : entry.target.href;
  return { label: entry.label, href: target, children: entry.children.map(toReaderToc) };
}

function findTocTarget(entries: readonly import('../contracts').ReaderTocEntry[], href: string, base: string): string | undefined {
  for (const entry of entries) {
    if (entry.href === href || entry.href === base) return entry.href;
    const nested = findTocTarget(entry.children, href, base);
    if (nested) return nested;
  }
  return undefined;
}

function toReaderSemanticNode(node: import('../../../modules/rito-rn/src/protocol/artifact-types').RitoSemanticNode): import('../contracts').ReaderSemanticNode {
  return {
    role: node.role === 'list-item' ? 'listitem' : node.role,
    level: node.level,
    label: node.text,
    alt: node.alt,
    href: node.href,
    bounds: node.bounds,
    children: node.children.map(toReaderSemanticNode),
  };
}

function createArtifactRequest(request: ReaderOpenRequest, layout: ReaderLayoutRequest, revisionId: number, operationId: number, initialHref: string): import('../rito/rito-native').RitoArtifactRequest {
  const typography = request.typography;
  const locator = request.restorePosition?.locator;
  const value: RitoLayoutRequest = { viewportWidth: layout.viewport.width, viewportHeight: layout.viewport.height, marginTop: typography.marginVertical, marginRight: typography.marginHorizontal, marginBottom: typography.marginVertical, marginLeft: typography.marginHorizontal, spreadMode: typography.spreadMode, firstPageAlone: true, spreadGap: 0, rootFontSize: typography.fontSize, lineHeightOverride: typography.lineHeight, fontFamilyOverride: typography.fontFamily };
  return { sessionId: BigInt(Math.max(1, revisionId)), requestId: BigInt(Math.max(1, operationId)), layout: value, locator: { href: locator?.manifestHref ?? initialHref, anchorId: locator?.sourcePoint ? undefined : undefined, progression: request.restorePosition?.progression }, work: { maxTopLevelNodesPerQuantum: 64, maxForegroundQuanta: 8, localPageCap: 64 }, textProfile: 'platform-string-runs' };
}
