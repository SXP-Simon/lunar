import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  LUNAR_ZIP_LIMITS,
  RITO_VERSION,
  inspectReaderBook,
  inspectReaderBookAssets,
  loadRitoDocument,
} from '../../src/reader/rito/rito-adapter';
import { ReaderPublicationLoader } from '../../src/reader/runtime/publication-loader';
import { readEncodedImageDimensions } from '../../src/reader/runtime/image-dimension-decoder';
import type {
  ReaderImageDimensions,
  ReaderImageResource,
  ReaderMeasurePaint,
} from '../../src/reader/contracts';

const fixtureDirectory = resolve('tests/fixtures');
const fixtureName = readdirSync(fixtureDirectory).find((name) => name.endsWith('.epub'));

function readFixture(): ArrayBuffer {
  if (!fixtureName) {
    throw new Error('An EPUB fixture is required for the Rito integration test.');
  }
  const data = readFileSync(resolve(fixtureDirectory, fixtureName));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

describe('Rito adapter', () => {
  it('pins the reader engine and archive limits', () => {
    expect(RITO_VERSION).toBe('0.13.0');
    expect(LUNAR_ZIP_LIMITS.maxArchiveBytes).toBe(100 * 1024 * 1024);
    expect(LUNAR_ZIP_LIMITS.maxCompressionRatio).toBe(100);
  });

  it('rejects an empty archive', () => {
    expect(() => loadRitoDocument(new ArrayBuffer(0))).toThrow();
  });

  it('extracts metadata from the licensed EPUB fixture', () => {
    const metadata = inspectReaderBook(readFixture());

    expect(metadata).toMatchObject({
      title: '我买下了与她的每周密会～以五千圆为借口，共度两人时光～ 第三卷',
      creator: '羽田宇佐',
      language: 'zh',
      identifier: 'calibre:23961',
      publisher: '富士见文库',
    });
    expect(metadata.description).toContain('暑假结束后');
  });

  it('extracts the cover referenced by the first spine document', () => {
    const inspection = inspectReaderBookAssets(readFixture());

    expect(inspection.cover).toMatchObject({
      source: 'Images/193982.jpg',
      mediaType: 'image/jpeg',
      fileExtension: 'jpg',
    });
    expect(inspection.cover?.bytes.byteLength).toBeGreaterThan(100_000);
    expect(
      readEncodedImageDimensions({
        href: inspection.cover?.source ?? '',
        bytes: inspection.cover?.bytes ?? new Uint8Array(),
      }),
    ).toEqual({ width: 1384, height: 2048 });
  });

  it('reads intrinsic dimensions for every image in the EPUB fixture', () => {
    const document = loadRitoDocument(readFixture());
    try {
      const dimensions = Array.from(document.images, ([href, bytes]) =>
        readEncodedImageDimensions({ href, bytes }),
      );

      expect(dimensions).toHaveLength(17);
      expect(dimensions.every(({ width, height }) => width > 0 && height > 0)).toBe(true);
    } finally {
      document.close();
    }
  });

  it('paginates the fixture and loads display lists with rendering parameters', async () => {
    const disposeImage = vi.fn();
    const paginationEvents: string[] = [];
    let firstPreviewSpreads = 0;
    let latestPreviewSpreads = 0;
    const loader = new ReaderPublicationLoader({
      yieldAfterChapter: vi.fn(async () => {
        paginationEvents.push('yield');
      }),
    });
    const publication = await loader.load({
      data: readFixture(),
      layout: {
        viewport: { width: 390, height: 844, pixelRatio: 3 },
        typography: {
          fontSize: 18,
          lineHeight: 1.6,
          marginHorizontal: 24,
          marginVertical: 32,
          spreadMode: 'single',
        },
        theme: 'paper',
      },
      textMeasurer: {
        measureText: approximateTextMeasurement,
      },
      imageDecoder: {
        decode: async (resource: ReaderImageResource): Promise<ReaderImageDimensions> => ({
          width: resource.href.endsWith('.png') ? 1200 : 800,
          height: 1200,
        }),
        dispose: disposeImage,
      },
      lineBreaking: 'greedy',
      onPublicationUpdated: (preview) => {
        paginationEvents.push('publication-update');
        latestPreviewSpreads = preview.totalSpreads;
        if (firstPreviewSpreads > 0) {
          return;
        }
        firstPreviewSpreads = preview.totalSpreads;
        expect(preview.totalPages).toBeGreaterThan(0);
        expect(preview.getFrame(0)).toBeDefined();
        expect(preview.chapterTimings).toHaveLength(1);
      },
    });

    const firstFrame = publication.getFrame(0);
    expect(publication.totalPages).toBeGreaterThan(100);
    expect(firstPreviewSpreads).toBeGreaterThan(0);
    expect(firstPreviewSpreads).toBeLessThan(publication.totalSpreads);
    expect(latestPreviewSpreads).toBe(publication.totalSpreads);
    expect(paginationEvents[0]).toBe('publication-update');
    expect(
      paginationEvents.filter((event) => event === 'publication-update').length,
    ).toBeGreaterThan(1);
    expect(paginationEvents).toContain('yield');
    expect(publication.totalSpreads).toBe(publication.totalPages);
    expect(publication.chapters).toHaveLength(20);
    expect(publication.chapterTimings).toHaveLength(20);
    expect(publication.layout).toMatchObject({
      viewportWidth: 390,
      viewportHeight: 844,
      pageWidth: 390,
      pageHeight: 844,
      pixelRatio: 3,
      spreadMode: 'single',
      palette: {
        backgroundColor: '#F1E7D0',
        foregroundColor: '#342D24',
      },
    });
    expect(firstFrame).toBeDefined();
    expect(firstFrame?.pageIndices).toEqual([0]);
    expect(firstFrame?.displayList.commands.length).toBeGreaterThan(0);
    expect(firstFrame?.displayList.commands.map((command) => command.kind)).toContain(
      'paintPage',
    );
    expect(firstFrame?.imageSources.length).toBeGreaterThan(0);
    expect(publication.getImage(firstFrame?.imageSources[0] ?? '')?.byteLength).toBeGreaterThan(0);
    expect(publication.toc.length).toBeGreaterThan(0);
    expect(publication.resolveToc(publication.toc[0]!.href)).toEqual(
      expect.any(Number),
    );

    publication.close();
    expect(disposeImage).toHaveBeenCalledTimes(17);
    expect(publication.getFrame(0)).toBeUndefined();
    expect(publication.resolveToc(publication.toc[0]!.href)).toBeUndefined();
  });
});

function approximateTextMeasurement(text: string, paint: ReaderMeasurePaint) {
  const characters = Array.from(text);
  const glyphWidth = characters.reduce(
    (width, character) => width + (character.codePointAt(0)! > 0xff ? 1 : 0.55),
    0,
  );
  const spaces = characters.filter((character) => character === ' ').length;
  return {
    width:
      glyphWidth * paint.font.sizePx +
      Math.max(0, characters.length - 1) * (paint.letterSpacingPx ?? 0) +
      spaces * (paint.wordSpacingPx ?? 0),
    height: paint.font.sizePx,
  };
}
