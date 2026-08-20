import {
  buildSpreadDisplayList,
  buildSpreads,
  loadEpub,
  type DisplayList,
  type DisplayListOptions,
  type EpubDocument,
  type ImageDimensions,
  type LayoutConfig,
  type Page,
  type Spread,
  type TextMeasurer,
  type ZipLimits,
} from '@ritojs/core';
import { PaginationSession } from '@ritojs/core/advanced';

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

export function loadRitoDocument(data: ArrayBuffer): EpubDocument {
  return loadEpub(data, { zipLimits: LUNAR_ZIP_LIMITS });
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
