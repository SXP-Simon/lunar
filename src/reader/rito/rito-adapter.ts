import {
  buildSpreadDisplayList,
  buildSpreads,
  collectSpreadImageSources,
  loadEpub,
  loadImagesWithDecoder,
  type DisplayList,
  type DisplayListOptions,
  type EpubDocument,
  type ImageDimensions,
  type LayoutConfig,
  type Page,
  type Spread,
  type TextMeasurer,
  type TocEntry,
  type ZipLimits,
} from '@ritojs/core';
import {
  CONTAINER_PATH,
  createZipReader,
  findPageForTocEntry,
  PaginationSession,
  parseContainer,
} from '@ritojs/core/advanced';

import type {
  LoadedReaderPublication,
  ReaderBookInspection,
  ReaderBookMetadata,
  ReaderChapterRange,
  ReaderChapterTiming,
  ReaderDisplayList,
  ReaderDrawCommand,
  ReaderFontRegistry,
  ReaderImageDecoder,
  ReaderImageDimensions,
  ReaderLayoutParameters,
  ReaderPublicationView,
  ReaderRenderFrame,
  ReaderTextMeasurer,
  ReaderTocEntry,
} from '../contracts';

export const RITO_VERSION = '0.13.0' as const;

export const LUNAR_ZIP_LIMITS: Readonly<ZipLimits> = {
  maxArchiveBytes: 100 * 1024 * 1024,
  maxTotalUncompressedBytes: 250 * 1024 * 1024,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxEntries: 5_000,
  maxCompressionRatio: 100,
};

export interface CreateRitoPaginationSessionOptions {
  readonly document: EpubDocument;
  readonly layout: LayoutConfig;
  readonly textMeasurer: TextMeasurer;
  readonly imageDimensions?: ReadonlyMap<string, ImageDimensions>;
  readonly lineBreaking?: 'greedy' | 'optimal';
}

export interface OpenRitoPaginationContextOptions<
  TImage extends ReaderImageDimensions = ReaderImageDimensions,
> {
  readonly data: ArrayBuffer;
  readonly layout: LayoutConfig;
  readonly layoutParameters: ReaderLayoutParameters;
  readonly displayListOptions: DisplayListOptions;
  readonly textMeasurer: ReaderTextMeasurer;
  readonly fontRegistry?: ReaderFontRegistry;
  readonly imageDecoder?: ReaderImageDecoder<TImage>;
  readonly imageDecodeConcurrency?: number;
  readonly lineBreaking?: 'greedy' | 'optimal';
}

export interface RitoChapterPagination {
  readonly pageCount: number;
  readonly done: boolean;
}

export interface RitoPaginationContext {
  readonly metadata: ReaderBookMetadata;
  readonly toc: readonly ReaderTocEntry[];
  paginateNextChapter(): RitoChapterPagination;
  buildPreview(chapterTimings: readonly ReaderChapterTiming[]): ReaderPublicationView;
  buildPublication(chapterTimings: readonly ReaderChapterTiming[]): LoadedReaderPublication;
  close(): void;
}

export function loadRitoDocument(data: ArrayBuffer): EpubDocument {
  return loadEpub(data, { zipLimits: LUNAR_ZIP_LIMITS });
}

export function inspectReaderBook(data: ArrayBuffer): ReaderBookMetadata {
  return inspectReaderBookAssets(data).metadata;
}

export function inspectReaderBookAssets(data: ArrayBuffer): ReaderBookInspection {
  const document = loadRitoDocument(data);
  try {
    return {
      metadata: toReaderMetadata(document, readExtendedPackageMetadata(data)),
      cover: findReaderCover(document),
    };
  } finally {
    document.close();
  }
}

export async function openRitoPaginationContext<
  TImage extends ReaderImageDimensions = ReaderImageDimensions,
>(options: OpenRitoPaginationContextOptions<TImage>): Promise<RitoPaginationContext> {
  const document = loadRitoDocument(options.data);
  let decodedImages: ReadonlyMap<string, TImage> = new Map();

  try {
    if (options.imageDecoder) {
      decodedImages = await loadImagesWithDecoder(
        document,
        options.imageDecoder,
        undefined,
        { maxConcurrency: options.imageDecodeConcurrency ?? 2 },
      );
    }

    const session = createRitoPaginationSession({
      document,
      layout: options.layout,
      textMeasurer: options.textMeasurer,
      imageDimensions: decodedImages,
      lineBreaking: options.lineBreaking,
    });
    // The library import already extracts publisher and description before it
    // persists a book. Reader opening only consumes the EPUB document's base
    // metadata, so reopening the archive for these optional OPF fields would
    // repeat its full ZIP index and inflate work.
    const metadata = toReaderMetadata(document);

    return new RitoPaginationContextImplementation(
      document,
      metadata,
      session,
      options.layout,
      options.layoutParameters,
      options.displayListOptions,
      decodedImages,
      options.imageDecoder,
      options.fontRegistry,
    );
  } catch (error) {
    for (const image of decodedImages.values()) {
      options.imageDecoder?.dispose(image);
    }
    options.fontRegistry?.dispose?.();
    document.close();
    throw error;
  }
}

export function createRitoPaginationSession(
  options: CreateRitoPaginationSessionOptions,
): PaginationSession {
  return new PaginationSession(
    options.document,
    options.layout,
    options.textMeasurer,
    options.imageDimensions,
    options.lineBreaking,
  );
}

export function createRitoSpreads(
  pages: readonly Page[],
  layout: LayoutConfig,
  chapterStartPages?: ReadonlySet<number>,
): readonly Spread[] {
  return buildSpreads(pages, layout, chapterStartPages);
}

export function createRitoSpreadDisplayList(
  spread: Spread,
  layout: LayoutConfig,
  options?: DisplayListOptions,
): DisplayList {
  return buildSpreadDisplayList(spread, layout, options);
}

class RitoPaginationContextImplementation<TImage extends ReaderImageDimensions>
  implements RitoPaginationContext
{
  readonly metadata: ReaderBookMetadata;
  readonly toc: readonly ReaderTocEntry[];

  private closed = false;
  private publicationBuilt = false;

  constructor(
    private readonly document: EpubDocument,
    metadata: ReaderBookMetadata,
    private readonly session: PaginationSession,
    private readonly layout: LayoutConfig,
    private readonly layoutParameters: ReaderLayoutParameters,
    private readonly displayListOptions: DisplayListOptions,
    private readonly decodedImages: ReadonlyMap<string, TImage>,
    private readonly imageDecoder?: ReaderImageDecoder<TImage>,
    private readonly fontRegistry?: ReaderFontRegistry,
  ) {
    this.metadata = metadata;
    this.toc = document.toc.map(toReaderTocEntry);
  }

  paginateNextChapter(): RitoChapterPagination {
    this.assertOpen();
    const result = this.session.paginateNextChapter();
    return { pageCount: result.pages.length, done: result.done };
  }

  buildPreview(
    chapterTimings: readonly ReaderChapterTiming[],
  ): ReaderPublicationView {
    this.assertOpen();
    return this.createPublicationView(chapterTimings);
  }

  buildPublication(
    chapterTimings: readonly ReaderChapterTiming[],
  ): LoadedReaderPublication {
    this.assertOpen();
    if (this.publicationBuilt) {
      throw new Error('The pagination context has already produced a publication.');
    }

    const view = this.createPublicationView(chapterTimings);

    this.publicationBuilt = true;
    return new RitoLoadedPublication(
      view,
      this.document,
      this.decodedImages,
      this.imageDecoder,
      this.fontRegistry,
    );
  }

  private createPublicationView(
    chapterTimings: readonly ReaderChapterTiming[],
  ): ReaderPublicationView {
    const result = this.session.getResult();
    const chapterStartPages = new Set(
      Array.from(result.chapterMap.values(), (range) => range.startPage),
    );
    const spreads = createRitoSpreads(result.pages, this.layout, chapterStartPages);
    const chapters = Array.from(result.chapterMap, ([spineIdref, range]) => ({
      spineIdref,
      startPage: range.startPage,
      endPage: range.endPage,
    } satisfies ReaderChapterRange));
    const tocTargets = createTocTargetMap(
      this.document,
      result.chapterMap,
      result.anchorMap,
      result.chapterAnchorMap,
      spreads,
    );

    return new RitoPublicationView(
      this.metadata,
      this.toc,
      this.layoutParameters,
      result.pages.length,
      chapters,
      chapterTimings,
      spreads,
      tocTargets,
      this.document,
      this.layout,
      this.displayListOptions,
    );
  }

  close(): void {
    if (this.closed || this.publicationBuilt) {
      return;
    }
    this.closed = true;
    disposeRitoResources(
      this.document,
      this.decodedImages,
      this.imageDecoder,
      this.fontRegistry,
    );
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('The pagination context is closed.');
    }
  }
}

class RitoPublicationView implements ReaderPublicationView {
  readonly totalSpreads: number;

  private readonly frames = new Map<number, ReaderRenderFrame>();
  private readonly imageResolver: (source: string) => Uint8Array | undefined;

  constructor(
    readonly metadata: ReaderBookMetadata,
    readonly toc: readonly ReaderTocEntry[],
    readonly layout: ReaderLayoutParameters,
    readonly totalPages: number,
    readonly chapters: readonly ReaderChapterRange[],
    readonly chapterTimings: readonly ReaderChapterTiming[],
    private readonly spreads: readonly Spread[],
    private readonly tocTargets: ReadonlyMap<string, number>,
    document: EpubDocument,
    private readonly ritoLayout: LayoutConfig,
    private readonly displayListOptions: DisplayListOptions,
  ) {
    this.totalSpreads = spreads.length;
    this.imageResolver = createReaderImageResolver(document.images);
  }

  getFrame(spreadIndex: number): ReaderRenderFrame | undefined {
    const cached = this.frames.get(spreadIndex);
    if (cached) {
      return cached;
    }
    const spread = this.spreads[spreadIndex];
    if (!spread) {
      return undefined;
    }
    const frame = toReaderFrame(spread, this.ritoLayout, this.displayListOptions);
    this.frames.set(spreadIndex, frame);
    return frame;
  }

  getImage(source: string): Uint8Array | undefined {
    return this.imageResolver(source);
  }

  resolveToc(href: string): number | undefined {
    return this.tocTargets.get(href) ?? this.tocTargets.get(decodeHref(href));
  }
}

class RitoLoadedPublication<TImage extends ReaderImageDimensions>
  implements LoadedReaderPublication
{
  private closed = false;

  constructor(
    private readonly view: ReaderPublicationView,
    private readonly document: EpubDocument,
    private readonly decodedImages: ReadonlyMap<string, TImage>,
    private readonly imageDecoder?: ReaderImageDecoder<TImage>,
    private readonly fontRegistry?: ReaderFontRegistry,
  ) {}

  get metadata() {
    return this.view.metadata;
  }

  get toc() {
    return this.view.toc;
  }

  get layout() {
    return this.view.layout;
  }

  get totalPages() {
    return this.view.totalPages;
  }

  get totalSpreads() {
    return this.view.totalSpreads;
  }

  get chapters() {
    return this.view.chapters;
  }

  get chapterTimings() {
    return this.view.chapterTimings;
  }

  getFrame(spreadIndex: number): ReaderRenderFrame | undefined {
    return this.closed ? undefined : this.view.getFrame(spreadIndex);
  }

  getImage(source: string): Uint8Array | undefined {
    return this.closed ? undefined : this.view.getImage(source);
  }

  resolveToc(href: string): number | undefined {
    return this.closed ? undefined : this.view.resolveToc(href);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    disposeRitoResources(
      this.document,
      this.decodedImages,
      this.imageDecoder,
      this.fontRegistry,
    );
  }
}

function disposeRitoResources<TImage extends ReaderImageDimensions>(
  document: EpubDocument,
  decodedImages: ReadonlyMap<string, TImage>,
  imageDecoder?: ReaderImageDecoder<TImage>,
  fontRegistry?: ReaderFontRegistry,
): void {
  if (imageDecoder) {
    for (const image of new Set(decodedImages.values())) {
      imageDecoder.dispose(image);
    }
  }
  fontRegistry?.dispose?.();
  document.close();
}

function toReaderMetadata(
  document: EpubDocument,
  extended: Pick<ReaderBookMetadata, 'publisher' | 'description'> = {},
): ReaderBookMetadata {
  const metadata = document.packageDocument.metadata;
  return {
    title: metadata.title,
    language: metadata.language,
    identifier: metadata.identifier,
    creator: metadata.creator,
    publisher: extended.publisher,
    description: extended.description,
  };
}

function readExtendedPackageMetadata(
  data: ArrayBuffer,
): Pick<ReaderBookMetadata, 'publisher' | 'description'> {
  const reader = createZipReader(data, LUNAR_ZIP_LIMITS);
  try {
    const packagePath = normalizeArchivePath(
      parseContainer(reader.readTextFile(CONTAINER_PATH)),
    );
    const packageXml = reader.readTextFile(packagePath);
    return {
      publisher: extractPackageText(packageXml, 'publisher'),
      description: extractPackageText(packageXml, 'description'),
    };
  } catch {
    return {};
  } finally {
    reader.close();
  }
}

function normalizeArchivePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized.startsWith('/') ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error('The EPUB package path is unsafe.');
  }
  return normalized;
}

function extractPackageText(xml: string, localName: string): string | undefined {
  const qualifiedName = `(?:[A-Za-z_][\\w.-]*:)?${localName}`;
  const match = xml.match(
    new RegExp(`<${qualifiedName}\\b[^>]*>([\\s\\S]*?)<\\/${qualifiedName}\\s*>`, 'i'),
  );
  if (!match?.[1]) {
    return undefined;
  }

  const text = match[1]
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  return text ? decodeXmlEntities(text) : undefined;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function toReaderTocEntry(entry: TocEntry): ReaderTocEntry {
  return {
    label: entry.label,
    href: entry.href,
    children: entry.children.map(toReaderTocEntry),
  };
}

function findReaderCover(document: EpubDocument): ReaderBookInspection['cover'] {
  const imageItems = document.packageDocument.manifest.filter((item) =>
    item.mediaType.startsWith('image/'),
  );
  const declaredCover = imageItems.find((item) => item.properties?.includes('cover-image'));
  const declaredAsset = declaredCover
    ? toReaderCoverAsset(document, declaredCover.href, declaredCover.mediaType)
    : undefined;
  if (declaredAsset) {
    return declaredAsset;
  }

  const firstSpineItem = document.packageDocument.spine.find((item) => item.linear);
  const firstChapterItem = firstSpineItem
    ? document.packageDocument.manifest.find((item) => item.id === firstSpineItem.idref)
    : undefined;
  const firstChapter = firstSpineItem
    ? document.readChapter(firstSpineItem.idref)
    : undefined;
  const firstChapterImage = firstChapter
    ? extractFirstImageSource(firstChapter)
    : undefined;
  if (firstChapterImage) {
    const resolvedSource = resolveArchiveRelativeHref(
      firstChapterItem?.href ?? '',
      firstChapterImage,
    );
    const manifestItem = findImageManifestItem(imageItems, resolvedSource);
    const chapterAsset = toReaderCoverAsset(
      document,
      manifestItem?.href ?? resolvedSource,
      manifestItem?.mediaType,
    );
    if (chapterAsset) {
      return chapterAsset;
    }
  }

  const namedCover = imageItems.find(
    (item) => /(^|[\W_])cover([\W_]|$)/i.test(item.id) || /(^|\/)cover[\W_]/i.test(item.href),
  );
  const fallbackItem = namedCover ?? imageItems[0];
  return fallbackItem
    ? toReaderCoverAsset(document, fallbackItem.href, fallbackItem.mediaType)
    : undefined;
}

function toReaderCoverAsset(
  document: EpubDocument,
  source: string,
  mediaType?: string,
): ReaderBookInspection['cover'] {
  const image = resolveImageEntry(document.images, source);
  if (!image) {
    return undefined;
  }
  const resolvedMediaType = mediaType ?? inferImageMediaType(image.source);
  return {
    source: image.source,
    mediaType: resolvedMediaType,
    fileExtension: inferImageFileExtension(image.source, resolvedMediaType),
    bytes: image.bytes.slice(),
  };
}

function extractFirstImageSource(xhtml: string): string | undefined {
  const match = xhtml.match(
    /<(?:img|image)\b[^>]*?\b(?:xlink:href|href|src)\s*=\s*["']([^"']+)["']/i,
  );
  return match?.[1]
    ?.replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function resolveArchiveRelativeHref(baseHref: string, source: string): string {
  const cleanSource = source.split(/[?#]/, 1)[0] ?? source;
  if (/^[a-z][a-z\d+.-]*:/i.test(cleanSource) || cleanSource.startsWith('/')) {
    return cleanSource;
  }

  const segments = baseHref.split('/');
  segments.pop();
  for (const segment of cleanSource.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

function findImageManifestItem(
  items: readonly { readonly href: string; readonly mediaType: string }[],
  source: string,
): { readonly href: string; readonly mediaType: string } | undefined {
  const decodedSource = decodeHref(source);
  return items.find(
    (item) => item.href === source || decodeHref(item.href) === decodedSource,
  );
}

function resolveImageEntry(
  images: ReadonlyMap<string, Uint8Array>,
  source: string,
): { readonly source: string; readonly bytes: Uint8Array } | undefined {
  const decoded = decodeHref(source);
  const normalized = decoded.replace(/^(\.\.\/)+/, '');
  for (const candidate of [source, decoded, normalized]) {
    const bytes = images.get(candidate);
    if (bytes) {
      return { source: candidate, bytes };
    }
  }

  const matches = Array.from(images, ([href, bytes]) => ({ href, bytes })).filter(
    ({ href }) => normalized.endsWith(href) || href.endsWith(normalized),
  );
  if (matches.length === 1) {
    return { source: matches[0]!.href, bytes: matches[0]!.bytes };
  }

  const basename = normalized.split('/').at(-1);
  const basenameMatches = basename
    ? Array.from(images, ([href, bytes]) => ({ href, bytes })).filter(
        ({ href }) => href.split('/').at(-1) === basename,
      )
    : [];
  return basenameMatches.length === 1
    ? { source: basenameMatches[0]!.href, bytes: basenameMatches[0]!.bytes }
    : undefined;
}

function inferImageMediaType(source: string): string {
  const extension = source.split('.').at(-1)?.toLocaleLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
    case 'gif':
    case 'webp':
    case 'avif':
    case 'bmp':
      return `image/${extension}`;
    default:
      return 'application/octet-stream';
  }
}

function inferImageFileExtension(source: string, mediaType: string): string {
  const extension = source
    .split(/[?#]/, 1)[0]
    ?.split('.')
    .at(-1)
    ?.toLocaleLowerCase();
  if (extension && /^(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/.test(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }
  switch (mediaType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    default:
      return mediaType.startsWith('image/')
        ? mediaType.slice('image/'.length).replace(/[^a-z\d]/gi, '') || 'img'
        : 'img';
  }
}

function toReaderFrame(
  spread: Spread,
  layout: LayoutConfig,
  options: DisplayListOptions,
): ReaderRenderFrame {
  const displayList = createRitoSpreadDisplayList(spread, layout, options);
  const pageIndices = [spread.left?.index, spread.right?.index].filter(
    (value): value is number => value !== undefined,
  );
  return {
    spreadIndex: spread.index,
    pageIndices,
    width: displayList.width,
    height: displayList.height,
    imageSources: collectSpreadImageSources(spread),
    displayList: toReaderDisplayList(displayList),
  };
}

function toReaderDisplayList(displayList: DisplayList): ReaderDisplayList {
  return {
    width: displayList.width,
    height: displayList.height,
    commands: displayList.commands as readonly ReaderDrawCommand[],
  };
}

function createTocTargetMap(
  document: EpubDocument,
  chapterMap: ReadonlyMap<string, { readonly startPage: number; readonly endPage: number }>,
  anchorMap: ReadonlyMap<string, number>,
  chapterAnchorMap: ReadonlyMap<string, ReadonlyMap<string, number>> | undefined,
  spreads: readonly Spread[],
): ReadonlyMap<string, number> {
  const targets = new Map<string, number>();
  const manifestHrefs = new Map(
    document.packageDocument.manifest.map((item) => [item.id, item.href] as const),
  );

  const visit = (entries: readonly TocEntry[]) => {
    for (const entry of entries) {
      const pageIndex = findPageForTocEntry(
        entry,
        chapterMap,
        document.packageDocument.spine,
        manifestHrefs,
        anchorMap,
        chapterAnchorMap,
      );
      if (pageIndex !== undefined) {
        const spreadIndex = spreads.findIndex(
          (spread) =>
            spread.left?.index === pageIndex || spread.right?.index === pageIndex,
        );
        if (spreadIndex >= 0) {
          targets.set(entry.href, spreadIndex);
          targets.set(decodeHref(entry.href), spreadIndex);
        }
      }
      visit(entry.children);
    }
  };

  visit(document.toc);
  return targets;
}

function createReaderImageResolver(
  images: ReadonlyMap<string, Uint8Array>,
): (source: string) => Uint8Array | undefined {
  const basenameCounts = new Map<string, number>();
  const byBasename = new Map<string, Uint8Array>();
  for (const [href, image] of images) {
    const basename = href.split('/').at(-1);
    if (!basename) {
      continue;
    }
    basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1);
    byBasename.set(basename, image);
  }

  return (source) => {
    const decoded = decodeHref(source);
    const normalized = decoded.replace(/^(\.\.\/)+/, '');
    const exact = images.get(decoded) ?? images.get(normalized);
    if (exact) {
      return exact;
    }

    for (const [href, image] of images) {
      if (normalized.endsWith(href) || href.endsWith(normalized)) {
        return image;
      }
    }

    const basename = normalized.split('/').at(-1);
    return basename && basenameCounts.get(basename) === 1
      ? byBasename.get(basename)
      : undefined;
  };
}

function decodeHref(source: string): string {
  if (!source.includes('%')) {
    return source;
  }
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}
