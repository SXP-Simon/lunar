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

interface PublicationSlot {
  readonly artifactId: bigint;
  readonly frame?: ReaderRenderFrame;
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
    const publication = new RitoNativePublication(opened.session, opened.artifact, publicationMetadata, options.layout, request, options.fontRegistry, options.imageDecoder);
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
  private readonly slots = new Map<number, PublicationSlot>();
  private readonly images = new Map<string, Uint8Array>();
  private closed = false;
  private visibleIndex = 0;
  private totalSpreadsValue?: number;
  private readonly metadataValue: LoadedReaderPublication['metadata'];
  private readonly tocValue: LoadedReaderPublication['toc'];
  private readonly tocLabelsByHref: ReadonlyMap<string, string>;
  private readonly spine: RitoPublication['spine'];
  private backgroundTail: Promise<void> = Promise.resolve();

  private readonly spreadMode: 'single' | 'double';
  private readonly layoutValue: LoadedReaderPublication['layout'];

  constructor(private readonly session: RitoReaderSession, first: RitoArtifact, publication: RitoPublication, layout: ReaderLayoutRequest, private readonly artifactRequest: import('../rito/rito-native').RitoArtifactRequest, private readonly fonts?: ReaderFontRegistry, private readonly imageDecoder?: ReaderImageDecoder) {
    this.spreadMode = layout.typography.spreadMode;
    this.layoutValue = toReaderLayoutParameters(layout);
    this.metadataValue = publication.metadata;
    this.tocValue = publication.toc.map(toReaderToc);
    this.tocLabelsByHref = createTocLabelIndex(this.tocValue);
    this.spine = publication.spine;
    this.slots.set(0, { artifactId: first.artifactId });
    this.totalSpreadsValue = first.bookPageCount !== undefined
      ? spreadCountFromBookPages(first.bookPageCount, this.spreadMode)
      : undefined;
  }

  async prepare(artifact: RitoArtifact, spreadIndex = this.indexForArtifact(artifact), replace = false): Promise<void> {
    const sourceKey = artifactSourceKey(artifact);
    const existing = this.slots.get(spreadIndex);
    if (existing?.frame && !replace && existing.frame.sourceKey === sourceKey) return;
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
    const frame: ReaderRenderFrame = {
      spreadIndex,
      sourceKey,
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
    };
    this.slots.set(spreadIndex, { artifactId: artifact.artifactId, frame });
  }

  getFrame(spreadIndex: number): ReaderRenderFrame | undefined {
    return this.slots.get(spreadIndex)?.frame;
  }

  async ensureFrame(spreadIndex: number): Promise<void> {
    await this.backgroundTail.catch(() => undefined);
    if (spreadIndex === this.visibleIndex) {
      const current = this.currentArtifact;
      const slot = this.slots.get(spreadIndex);
      if (
        current &&
        slot?.artifactId === current.artifactId &&
        slot.frame?.sourceKey === artifactSourceKey(current)
      ) {
        return;
      }
      if (current) await this.prepare(current, spreadIndex);
      return;
    }
    const distance = Math.abs(spreadIndex - this.visibleIndex);
    if (distance === 0 || distance > 4096) return;
    const direction = spreadIndex > this.visibleIndex ? 'next' : 'previous';
    for (let step = 0; step < distance; step += 1) {
      const currentId = this.session.currentVisibleArtifactId;
      const current = currentId === undefined ? undefined : this.session.getArtifact(currentId);
      if (!current || currentId === undefined) return;
      const artifact = await this.session.turn({
        sessionId: current.sessionId,
        requestId: this.session.nextRequestId,
        fromArtifactId: current.artifactId,
        direction,
        work: { maxTopLevelNodesPerQuantum: 64, maxForegroundQuanta: 8, localPageCap: 16 },
      });
      const nextIndex = this.visibleIndex + (direction === 'next' ? 1 : -1);
      await this.prepare(artifact, nextIndex);
      this.assignArtifact(nextIndex, artifact);
      this.visibleIndex = nextIndex;
      this.totalSpreadsValue = artifact.bookPageCount !== undefined
        ? spreadCountFromBookPages(artifact.bookPageCount, this.spreadMode)
        : this.totalSpreadsValue;
      await this.session.releaseArtifact(current.artifactId).catch(() => undefined);
    }
  }
  getImage(source: string): Uint8Array | undefined { return this.images.get(source); }
  get metadata() { return this.metadataValue; }
  get toc() { return this.tocValue; }
  get layout() { return this.layoutValue; }
  getCurrentChapterTitle(): string | undefined {
    const artifact = this.currentArtifact;
    if (!artifact) return undefined;
    const locatorHref = artifact.locator.anchorId
      ? `${artifact.locator.href}#${artifact.locator.anchorId}`
      : artifact.locator.href;
    return this.tocLabelsByHref.get(locatorHref)
      ?? this.tocLabelsByHref.get(artifact.locator.href);
  }
  getBookPageIndex(spreadIndex: number): number | undefined {
    return this.artifactForSpread(spreadIndex)?.bookPageIndex;
  }
  getCurrentLocator(spreadIndex: number): import('../contracts').ReaderLocator | undefined {
    const artifact = this.artifactForSpread(spreadIndex);
    return artifact ? toReaderLocator(artifact.locator, this.spine) : undefined;
  }
  canNavigate(direction: 'next' | 'previous'): boolean {
    const availability = this.currentArtifact?.navigation[direction];
    return availability !== 'terminal' && availability !== 'blocked';
  }
  get totalPages() {
    return Math.max(1, this.availableArtifacts.reduce((max, artifact) => {
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
      const pages = this.availableArtifacts.filter((artifact) => artifact.locator.href === item.href || artifact.locator.href.startsWith(`${item.href}#`));
      if (pages.length === 0) return undefined;
      const startPage = Math.min(...pages.map((artifact) => artifact.bookPageIndex ?? artifact.localPageIndex));
      const endPage = Math.max(...pages.map((artifact) => (artifact.bookPageIndex ?? artifact.localPageIndex) + artifact.localPageIndexes.length - 1));
      return { spineIdref: item.idref, startPage, endPage };
    }).filter((range): range is { spineIdref: string; startPage: number; endPage: number } => range !== undefined);
  }
  get chapterTimings() { return []; }
  async resolveToc(href: string): Promise<number | undefined> {
    const base = href.split('#', 1)[0];
    const target = findTocTarget(this.tocValue, href, base);
    const targetBase = target?.split('#', 1)[0] ?? base;
    const targetAnchor = target?.includes('#') ? target.slice(target.indexOf('#') + 1) : undefined;
    const existing = this.findArtifactForTocTarget(targetBase, href, targetAnchor);
    if (existing !== undefined && existing === this.visibleIndex) return existing;

    const targetSpineIndex = this.spine.findIndex((item) => item.href === targetBase);
    if (targetSpineIndex < 0 || this.session.currentVisibleArtifactId === undefined) return undefined;
    const targetIndex = this.visibleIndex;
    const source = this.currentArtifact;
    if (!source) return undefined;
    const artifact = await this.session.requestArtifact({
      ...this.artifactRequest,
      requestId: this.session.nextRequestId,
      locator: {
        href: targetBase,
        anchorId: targetAnchor,
      },
      work: { ...this.artifactRequest.work, maxForegroundQuanta: 8, localPageCap: 16 },
    });
    await this.prepare(artifact, targetIndex, true);
    await this.session.adoptForeground({
      sessionId: artifact.sessionId,
      expectedVisibleArtifactId: source.artifactId,
      candidateArtifactId: artifact.artifactId,
    });
    this.assignArtifact(targetIndex, artifact);
    this.totalSpreadsValue = artifact.bookPageCount === undefined
      ? undefined
      : spreadCountFromBookPages(artifact.bookPageCount, this.spreadMode);
    await this.session.releaseArtifact(source.artifactId).catch(() => undefined);
    return targetIndex;
  }

  private findArtifactForTocTarget(targetBase: string, href: string, targetAnchor?: string): number | undefined {
    const artifact = this.availableArtifacts.find((candidate) =>
      artifactMatchesTocTarget(candidate, targetBase, href, targetAnchor),
    );
    return artifact === undefined ? undefined : this.indexForArtifact(artifact);
  }

  async resolveTextRangeGeometry(request: import('../contracts').ReaderTextRangeGeometryRequest): Promise<readonly import('../contracts').ReaderTextRangeRect[]> {
    const artifact = this.availableArtifacts.find((candidate) => candidate.localPageIndexes.includes(request.pageIndex));
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
    const artifact = this.currentArtifact;
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
          anchorId: result.locator.anchorId,
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
    for (const [spreadIndex, slot] of this.slots) {
      if (slot.artifactId === artifact.artifactId) return spreadIndex;
    }
    return this.visibleIndex;
  }

  async advanceBackground(maxTopLevelNodesPerQuantum: number): Promise<import('../../../modules/rito-rn/src/protocol/artifact-types').RitoBackgroundAdvance> {
    const backgroundStartedAt = readerPerformanceStart('reader.backend.background');
    let result!: import('../../../modules/rito-rn/src/protocol/artifact-types').RitoBackgroundAdvance;
    const run = this.backgroundTail.then(async () => {
      const visibleId = this.session.currentVisibleArtifactId;
      if (!visibleId) throw new Error('Rito background pagination requires a visible artifact.');
      const current = this.session.getArtifact(visibleId);
      if (!current) throw new Error('Rito visible artifact is unavailable.');
      const advance = await this.session.advanceBackground({ sessionId: current.sessionId, expectedVisibleArtifactId: current.artifactId, maxTopLevelNodesPerQuantum });
      result = advance;
      const candidate = advance.artifact;
      if (!candidate) return;
      if (advance.movesVisibleContent) {
        await this.session.releaseArtifact(candidate.artifactId).catch(() => undefined);
        return;
      }
      const currentIndex = this.indexForArtifact(current);
      // Keep the slot record atomic: the artifact and its frame are replaced
      // together even when background pagination only adds book numbering.
      await this.prepare(candidate, currentIndex, true);
      this.assignArtifact(currentIndex, candidate);
      if (this.session.currentVisibleArtifactId !== current.artifactId) {
        await this.session.releaseArtifact(candidate.artifactId).catch(() => undefined);
        return;
      }
      await this.session.adoptBackground({ sessionId: current.sessionId, expectedVisibleArtifactId: current.artifactId, candidateArtifactId: candidate.artifactId });
      this.visibleIndex = currentIndex;
      if (candidate.bookPageCount !== undefined) {
        this.totalSpreadsValue = spreadCountFromBookPages(candidate.bookPageCount, this.spreadMode);
      }
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
    const artifactIds = new Set([...this.slots.values()].map((slot) => slot.artifactId));
    this.slots.clear();
    for (const artifactId of artifactIds) await this.session.releaseArtifact(artifactId).catch(() => undefined);
    await this.session.dispose();
  }

  private get currentArtifact(): RitoArtifact | undefined {
    return this.session.currentVisibleArtifact;
  }

  private get availableArtifacts(): RitoArtifact[] {
    const artifacts: RitoArtifact[] = [];
    for (const slot of this.slots.values()) {
      const artifact = this.session.getArtifact(slot.artifactId);
      if (artifact) artifacts.push(artifact);
    }
    return artifacts;
  }

  private artifactForSpread(spreadIndex: number): RitoArtifact | undefined {
    const artifactId = this.slots.get(spreadIndex)?.artifactId;
    return artifactId === undefined ? undefined : this.session.getArtifact(artifactId);
  }

  private assignArtifact(spreadIndex: number, artifact: RitoArtifact): void {
    const current = this.slots.get(spreadIndex);
    this.slots.set(spreadIndex, {
      artifactId: artifact.artifactId,
      ...(current?.artifactId === artifact.artifactId && current.frame
        ? { frame: current.frame }
        : {}),
    });
  }
}

function spreadCountFromBookPages(pageCount: number, spreadMode: 'single' | 'double'): number {
  if (spreadMode === 'single') return Math.max(1, pageCount);
  return Math.max(1, Math.ceil(pageCount / 2));
}

function artifactSourceKey(artifact: RitoArtifact): string {
  // Artifact identity also covers interaction metadata such as hit maps and
  // source locators. Two pages can share an identical display-list digest
  // while belonging to different chapters, so the digest alone cannot guard
  // a frame cache slot.
  return `${artifact.revisionId.toString()}:${artifact.artifactId.toString()}`;
}

function safeTextOffset(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Rito source text offset exceeds JavaScript safe integer range.');
  return Number(value);
}

function toReaderToc(entry: RitoTocEntry): import('../contracts').ReaderTocEntry {
  type MutableEntry = { label: string; href: string; children: MutableEntry[] };
  const target = entry.target.kind === 'locator'
    ? `${entry.target.locator.href}${entry.target.locator.anchorId ? `#${entry.target.locator.anchorId}` : ''}`
    : entry.target.href;
  const root: MutableEntry = { label: entry.label, href: target, children: [] };
  const visited = new Set<RitoTocEntry>([entry]);
  const stack: { source: RitoTocEntry; output: MutableEntry }[] = [{ source: entry, output: root }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    for (let index = current.source.children.length - 1; index >= 0; index -= 1) {
      const child = current.source.children[index];
      if (visited.has(child)) continue;
      visited.add(child);
      const childTarget = child.target.kind === 'locator'
        ? `${child.target.locator.href}${child.target.locator.anchorId ? `#${child.target.locator.anchorId}` : ''}`
        : child.target.href;
      const childOutput: MutableEntry = { label: child.label, href: childTarget, children: [] };
      current.output.children.unshift(childOutput);
      stack.push({ source: child, output: childOutput });
    }
  }
  return root;
}

function findTocTarget(entries: readonly import('../contracts').ReaderTocEntry[], href: string, base: string): string | undefined {
  const stack = [...entries].reverse();
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) continue;
    if (entry.href === href || entry.href === base) return entry.href;
    for (let index = entry.children.length - 1; index >= 0; index -= 1) {
      stack.push(entry.children[index]);
    }
  }
  return undefined;
}

function artifactMatchesTocTarget(
  artifact: RitoArtifact,
  targetBase: string,
  href: string,
  targetAnchor?: string,
): boolean {
  return (artifact.locator.href === targetBase || artifact.locator.href === href)
    && (!targetAnchor || artifact.locator.anchorId === targetAnchor);
}

function toReaderLocator(
  locator: import('../../../modules/rito-rn/src/protocol/artifact-types').RitoLocator,
  spine: readonly RitoPublication['spine'][number][],
): import('../contracts').ReaderLocator {
  return {
    spineIdref: spine.find((item) => item.href === locator.href)?.idref ?? locator.href,
    manifestHref: locator.href,
    anchorId: locator.anchorId,
    chapterProgress: locator.progression ?? 0,
    sourcePoint: locator.sourcePoint
      ? { nodePath: locator.sourcePoint.nodePath, textOffset: safeTextOffset(locator.sourcePoint.textOffset) }
      : undefined,
    sourceRange: locator.sourceRange
      ? {
          start: { nodePath: locator.sourceRange.start.nodePath, textOffset: safeTextOffset(locator.sourceRange.start.textOffset) },
          end: { nodePath: locator.sourceRange.end.nodePath, textOffset: safeTextOffset(locator.sourceRange.end.textOffset) },
        }
      : undefined,
  };
}

function createTocLabelIndex(entries: readonly import('../contracts').ReaderTocEntry[]): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const visited = new Set<import('../contracts').ReaderTocEntry>();
  const stack = [...entries].reverse();
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry || visited.has(entry)) continue;
    visited.add(entry);
    if (!labels.has(entry.href)) labels.set(entry.href, entry.label);
    const base = entry.href.split('#', 1)[0];
    if (!labels.has(base)) labels.set(base, entry.label);
    for (let index = entry.children.length - 1; index >= 0; index -= 1) {
      stack.push(entry.children[index]);
    }
  }
  return labels;
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
  return {
    sessionId: BigInt(Math.max(1, revisionId)),
    requestId: BigInt(Math.max(1, operationId)),
    layout: value,
    locator: {
      href: locator?.manifestHref ?? initialHref,
      anchorId: locator?.anchorId,
      sourcePoint: locator?.sourcePoint
        ? { nodePath: locator.sourcePoint.nodePath, textOffset: BigInt(Math.max(0, locator.sourcePoint.textOffset)) }
        : undefined,
      sourceRange: locator?.sourceRange
        ? {
            start: { nodePath: locator.sourceRange.start.nodePath, textOffset: BigInt(Math.max(0, locator.sourceRange.start.textOffset)) },
            end: { nodePath: locator.sourceRange.end.nodePath, textOffset: BigInt(Math.max(0, locator.sourceRange.end.textOffset)) },
          }
        : undefined,
      progression: locator?.sourcePoint || locator?.sourceRange ? undefined : request.restorePosition?.progression,
    },
    work: { maxTopLevelNodesPerQuantum: 64, maxForegroundQuanta: 8, localPageCap: 4 },
    textProfile: 'platform-string-runs',
  };
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
