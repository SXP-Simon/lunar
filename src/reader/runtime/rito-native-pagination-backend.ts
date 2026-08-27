import type {
  LoadedReaderPublication, ReaderFontRegistry, ReaderImageDecoder, ReaderLayoutRequest, ReaderOpenRequest, ReaderRenderFrame,
} from '../contracts';
import { toReaderV1DisplayList } from '../rito';
import { discoverReaderInitialSpineHref } from '../rito/epub-inspector';
import type { RitoNativePinnedFontFace, RitoArtifact, RitoLayoutRequest, RitoNativeReaderModule } from '../rito/rito-native';
import type { RitoReaderSession } from '../../../modules/rito-rn/src/session';
import type { RitoPublication, RitoTocEntry } from '../../../modules/rito-rn/src/protocol/artifact-types';
import type { ReaderBackgroundPaginationBackend, ReaderPaginationBackendOpenOptions, ReaderPaginationBackendResult } from './pagination-backend';
import { readerPerformanceEnd, readerPerformanceMark, readerPerformanceStart } from './performance';

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
    const openStartedAt = readerPerformanceStart('reader.backend.open');
    await this.close();
    const initialHref = this.config.initialHref ?? discoverReaderInitialSpineHref(new Uint8Array(options.data));
    readerPerformanceMark('reader.backend.initialHref', initialHref);
    const pinnedFonts = typeof this.config.pinnedFonts === 'function'
      ? await this.config.pinnedFonts(new Uint8Array(options.data))
      : this.config.pinnedFonts;
    const request = createArtifactRequest(options.request, options.layout, options.revisionId, options.operationId, initialHref);
    const { RitoReaderSession } = await import('../../../modules/rito-rn/src/session');
    const opened = await RitoReaderSession.open(new Uint8Array(options.data), request, pinnedFonts, { native: this.config.native });
    readerPerformanceMark('reader.backend.firstArtifact', `artifactId=${opened.artifact.artifactId.toString()}`);
    const publicationMetadata = await opened.session.readPublication();
    const publication = new RitoNativePublication(opened.session, opened.artifact, publicationMetadata, options.layout, options.fontRegistry, options.imageDecoder);
    await publication.prepare(opened.artifact);
    this.session = opened.session;
    this.publication = publication;
    this.operationId = options.operationId;
    this.revisionId = options.revisionId;
    readerPerformanceEnd('reader.backend.open', openStartedAt);
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
  private readonly artifactIndexes = new Map<bigint, number>();
  private readonly images = new Map<string, Uint8Array>();
  private closed = false;
  private visibleArtifactId?: bigint;
  private visibleIndex = 0;
  private totalSpreadsValue?: number;
  private readonly metadataValue: LoadedReaderPublication['metadata'];
  private readonly tocValue: LoadedReaderPublication['toc'];
  private readonly spine: RitoPublication['spine'];
  private backgroundTail: Promise<void> = Promise.resolve();

  private readonly spreadMode: 'single' | 'double';
  private readonly layoutValue: LoadedReaderPublication['layout'];

  constructor(private readonly session: RitoReaderSession, first: RitoArtifact, publication: RitoPublication, layout: ReaderLayoutRequest, private readonly fonts?: ReaderFontRegistry, private readonly imageDecoder?: ReaderImageDecoder) {
    this.spreadMode = layout.typography.spreadMode;
    this.layoutValue = toReaderLayoutParameters(layout);
    this.metadataValue = publication.metadata;
    this.tocValue = publication.toc.map(toReaderToc);
    this.spine = publication.spine;
    this.visibleArtifactId = first.artifactId;
    this.artifacts.set(0, first);
    this.artifactIndexes.set(first.artifactId, 0);
    this.totalSpreadsValue = first.bookPageCount !== undefined
      ? spreadCountFromBookPages(first.bookPageCount, this.spreadMode)
      : first.terminalExtent ? 1 : undefined;
  }

  async prepare(artifact: RitoArtifact, spreadIndex = this.indexForArtifact(artifact), replace = false): Promise<void> {
    if (this.frames.has(spreadIndex) && !replace) return;
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
    this.frames.set(spreadIndex, {
      spreadIndex,
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
        sourcePoint: hit.sourcePoint ? { nodePath: hit.sourcePoint.nodePath, textOffset: safeTextOffset(hit.sourcePoint.textOffset) } : undefined,
      }))),
      semantics: pages.flatMap((page) => page.semantics.map(toReaderSemanticNode)),
      text: pages.map((page) => page.text).join(''),
    });
  }

  getFrame(spreadIndex: number): ReaderRenderFrame | undefined {
    return this.frames.get(spreadIndex);
  }

  async ensureFrame(spreadIndex: number): Promise<void> {
    await this.backgroundTail.catch(() => undefined);
    if (spreadIndex === this.visibleIndex && this.frames.has(spreadIndex)) return;
    const distance = Math.abs(spreadIndex - this.visibleIndex);
    if (distance === 0 || distance > 4096) return;
    const direction = spreadIndex > this.visibleIndex ? 'next' : 'previous';
    for (let step = 0; step < distance; step += 1) {
      const current = this.artifacts.get(this.visibleIndex);
      if (!current || !this.visibleArtifactId) return;
      const artifact = await this.session.turn({
        sessionId: current.sessionId,
        requestId: this.session.nextRequestId,
        fromArtifactId: current.artifactId,
        direction,
        work: { maxTopLevelNodesPerQuantum: 64, maxForegroundQuanta: 8, localPageCap: 16 },
      });
      const nextIndex = this.visibleIndex + (direction === 'next' ? 1 : -1);
      await this.prepare(artifact, nextIndex);
      this.artifacts.set(nextIndex, artifact);
      this.artifactIndexes.set(artifact.artifactId, nextIndex);
      this.visibleArtifactId = artifact.artifactId;
      this.visibleIndex = nextIndex;
      this.totalSpreadsValue = artifact.bookPageCount !== undefined
        ? spreadCountFromBookPages(artifact.bookPageCount, this.spreadMode)
        : artifact.terminalExtent ? nextIndex + 1 : this.totalSpreadsValue;
      await this.session.releaseArtifact(current.artifactId).catch(() => undefined);
      if (this.frames.has(spreadIndex)) return;
    }
  }
  getImage(source: string): Uint8Array | undefined { return this.images.get(source); }
  get metadata() { return this.metadataValue; }
  get toc() { return this.tocValue; }
  get layout() { return this.layoutValue; }
  getCurrentChapterTitle(): string | undefined {
    const artifact = this.visibleArtifactId === undefined
      ? undefined
      : [...this.artifacts.values()].find((candidate) => candidate.artifactId === this.visibleArtifactId);
    if (!artifact) return undefined;
    const locatorHref = artifact.locator.anchorId
      ? `${artifact.locator.href}#${artifact.locator.anchorId}`
      : artifact.locator.href;
    return findTocLabel(this.tocValue, locatorHref);
  }
  get totalPages() {
    return Math.max(1, [...this.artifacts.values()].reduce((max, artifact) => {
      const end = artifact.bookPageCount
        ?? (artifact.bookPageIndex === undefined
          ? 0
          : artifact.bookPageIndex + artifact.localPageIndexes.length);
      return Math.max(max, end);
    }, 0));
  }
  get totalSpreads() { return this.totalSpreadsValue; }
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
    const artifact = [...this.artifacts.values()].find((artifact) =>
      (artifact.locator.href === targetBase || artifact.locator.href === href) &&
      (!targetAnchor || artifact.locator.anchorId === targetAnchor),
    );
    return artifact === undefined ? undefined : this.artifactIndexes.get(artifact.artifactId);
  }

  async resolveTextRangeGeometry(request: import('../contracts').ReaderTextRangeGeometryRequest): Promise<readonly import('../contracts').ReaderTextRangeRect[]> {
    const artifact = [...this.artifacts.values()].find((candidate) => candidate.localPageIndexes.includes(request.pageIndex));
    if (!artifact) return [];
    const geometry = await this.session.textRangeGeometry({
      sessionId: artifact.sessionId,
      artifactId: artifact.artifactId,
      pageIndex: request.pageIndex,
      start: request.start,
      end: request.end,
    });
    return geometry.rects;
  }

  async search(request: import('../contracts').ReaderSearchRequest): Promise<import('../contracts').ReaderSearchResponse> {
    const artifact = this.visibleArtifactId === undefined
      ? undefined
      : [...this.artifacts.values()].find((candidate) => candidate.artifactId === this.visibleArtifactId);
    if (!artifact) return { query: request.query, truncated: false, searchedPageCount: 0, scopeComplete: false, results: [] };
    const response = await this.session.search({
      sessionId: artifact.sessionId,
      artifactId: artifact.artifactId,
      query: request.query,
      caseSensitive: request.caseSensitive,
      wholeWord: request.wholeWord,
      limit: request.limit,
    });
    return {
      query: response.query,
      truncated: response.truncated,
      searchedPageCount: response.searchedPageCount,
      scopeComplete: response.scopeComplete,
      results: response.results.map((result) => ({
        pageIndex: result.pageIndex,
        spreadIndex: result.spreadIndex,
        start: result.start,
        end: result.end,
        context: result.context,
        locator: result.locator ? {
          spineIdref: this.spine.find((item) => item.href === result.locator?.href)?.idref ?? result.locator.href,
          manifestHref: result.locator.href,
          chapterProgress: result.locator.progression ?? 0,
          sourcePoint: result.locator.sourcePoint ? { nodePath: result.locator.sourcePoint.nodePath, textOffset: safeTextOffset(result.locator.sourcePoint.textOffset) } : undefined,
          sourceRange: result.locator.sourceRange ? {
            start: { nodePath: result.locator.sourceRange.start.nodePath, textOffset: safeTextOffset(result.locator.sourceRange.start.textOffset) },
            end: { nodePath: result.locator.sourceRange.end.nodePath, textOffset: safeTextOffset(result.locator.sourceRange.end.textOffset) },
          } : undefined,
        } : undefined,
      })),
    };
  }

  private indexForArtifact(artifact: RitoArtifact): number {
    return this.artifactIndexes.get(artifact.artifactId) ?? this.visibleIndex;
  }

  async advanceBackground(maxTopLevelNodesPerQuantum: number): Promise<import('../../../modules/rito-rn/src/protocol/artifact-types').RitoBackgroundAdvance> {
    const backgroundStartedAt = readerPerformanceStart('reader.backend.background');
    let result!: import('../../../modules/rito-rn/src/protocol/artifact-types').RitoBackgroundAdvance;
    const run = this.backgroundTail.then(async () => {
      const visibleId = this.session.currentVisibleArtifactId;
      if (!visibleId) throw new Error('Rito background pagination requires a visible artifact.');
      const current = [...this.artifacts.values()].find((artifact) => artifact.artifactId === visibleId);
      if (!current) throw new Error('Rito visible artifact is unavailable.');
      const advance = await this.session.advanceBackground({ sessionId: current.sessionId, expectedVisibleArtifactId: current.artifactId, maxTopLevelNodesPerQuantum });
      result = advance;
      const candidate = advance.artifact;
      if (!candidate) return;
      if (advance.movesVisibleContent) {
        await this.session.releaseArtifact(candidate.artifactId).catch(() => undefined);
        return;
      }
      const currentIndex = this.artifactIndexes.get(current.artifactId) ?? this.visibleIndex;
      // Background publication candidates normally carry the same visible
      // display list with improved book-wide numbering. Reuse the prepared
      // frame in that case; only rebuild when the painted commands changed.
      if (!bytesEqual(candidate.displayList.semanticDigest, current.displayList.semanticDigest)) {
        await this.prepare(candidate, currentIndex, true);
      }
      this.artifacts.set(currentIndex, candidate);
      this.artifactIndexes.set(candidate.artifactId, currentIndex);
      if (this.session.currentVisibleArtifactId !== current.artifactId) {
        await this.session.releaseArtifact(candidate.artifactId).catch(() => undefined);
        return;
      }
      await this.session.adoptBackground({ sessionId: current.sessionId, expectedVisibleArtifactId: current.artifactId, candidateArtifactId: candidate.artifactId });
      this.visibleArtifactId = candidate.artifactId;
      this.visibleIndex = currentIndex;
      this.totalSpreadsValue = candidate.bookPageCount !== undefined || candidate.terminalExtent
        ? candidate.bookPageCount !== undefined
          ? spreadCountFromBookPages(candidate.bookPageCount, this.spreadMode)
          : Math.max(this.totalSpreadsValue ?? 0, currentIndex + 1)
        : this.totalSpreadsValue;
      await this.session.releaseArtifact(current.artifactId).catch(() => undefined);
    });
    this.backgroundTail = run.then(() => undefined, () => undefined);
    try {
      await run;
      return result;
    } finally {
      readerPerformanceEnd('reader.backend.background', backgroundStartedAt);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const artifact of this.artifacts.values()) await this.session.releaseArtifact(artifact.artifactId).catch(() => undefined);
    await this.session.dispose();
  }
}

function spreadCountFromBookPages(pageCount: number, spreadMode: 'single' | 'double'): number {
  if (spreadMode === 'single') return Math.max(1, pageCount);
  return Math.max(1, Math.ceil(pageCount / 2));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function safeTextOffset(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Rito source text offset exceeds JavaScript safe integer range.');
  return Number(value);
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

function findTocLabel(entries: readonly import('../contracts').ReaderTocEntry[], href: string): string | undefined {
  const base = href.split('#', 1)[0];
  for (const entry of entries) {
    if (entry.href === href || entry.href.split('#', 1)[0] === base) return entry.label;
    const nested = findTocLabel(entry.children, href);
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
  const value: RitoLayoutRequest = { viewportWidth: layout.viewport.width, viewportHeight: layout.viewport.height, marginTop: typography.marginVertical, marginRight: typography.marginHorizontal, marginBottom: typography.marginVertical, marginLeft: typography.marginHorizontal, spreadMode: typography.spreadMode, firstPageAlone: typography.spreadMode === 'double', spreadGap: 0, rootFontSize: typography.fontSize, lineHeightOverride: typography.lineHeight, fontFamilyOverride: typography.fontFamily };
  return { sessionId: BigInt(Math.max(1, revisionId)), requestId: BigInt(Math.max(1, operationId)), layout: value, locator: { href: locator?.manifestHref ?? initialHref, anchorId: locator?.sourcePoint ? undefined : undefined, progression: request.restorePosition?.progression }, work: { maxTopLevelNodesPerQuantum: 64, maxForegroundQuanta: 8, localPageCap: 4 }, textProfile: 'platform-string-runs' };
}

function toReaderLayoutParameters(layout: ReaderLayoutRequest): import('../contracts').ReaderLayoutParameters {
  const typography = layout.typography;
  const palette = layout.theme === 'dark'
    ? { backgroundColor: '#000000', foregroundColor: '#FFFFFF', spreadBodyBackgroundColor: '#000000' }
    : layout.theme === 'paper'
      ? { backgroundColor: '#FAF9F6', foregroundColor: '#202020', spreadBodyBackgroundColor: '#FAF9F6' }
      : { backgroundColor: '#FFFFFF', foregroundColor: '#000000', spreadBodyBackgroundColor: '#FFFFFF' };
  return {
    viewportWidth: layout.viewport.width,
    viewportHeight: layout.viewport.height,
    pageWidth: layout.viewport.width,
    pageHeight: layout.viewport.height,
    pixelRatio: layout.viewport.pixelRatio,
    marginTop: typography.marginVertical,
    marginRight: typography.marginHorizontal,
    marginBottom: typography.marginVertical,
    marginLeft: typography.marginHorizontal,
    spreadMode: typography.spreadMode,
    spreadGap: 0,
    rootFontSize: typography.fontSize,
    lineHeight: typography.lineHeight,
    fontFamily: typography.fontFamily,
    palette,
  };
}
