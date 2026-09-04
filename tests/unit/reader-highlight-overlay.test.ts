import { describe, expect, it, vi } from 'vitest';

import type {
  ReaderHitEntry,
  ReaderRuntime,
  ReaderSearchResult,
  ReaderSourceRange,
} from '../../src/reader';
import {
  resolveReaderHighlightOverlays,
  resolveReaderSelectionSourceRange,
} from '../../src/features/reader/services/highlight-overlay-service';
import { createReaderTextSelection } from '../../src/reader/interaction/text-selection';

const entries: ReaderHitEntry[] = [
  hit('第一行', 0, 0),
  hit('第二行', 1, 24),
];
const sourceRanges: ReaderSourceRange[] = [
  { start: { nodePath: [1, 0], textOffset: 0 }, end: { nodePath: [1, 0], textOffset: 3 } },
  { start: { nodePath: [1, 0], textOffset: 3 }, end: { nodePath: [1, 0], textOffset: 6 } },
];

describe('reader highlight overlays', () => {
  it('resolves every selected run separately and composes a durable source range', async () => {
    const runtime = runtimeWithSearchResults([
      searchResult('第一行', 0, sourceRanges[0]),
      searchResult('第二行', 1, sourceRanges[1]),
    ]);
    const selection = createReaderTextSelection(entries, 0, 1);

    await expect(selection
      ? resolveReaderSelectionSourceRange(runtime, selection, 'chapter.xhtml')
      : undefined).resolves.toEqual({
      start: sourceRanges[0].start,
      end: sourceRanges[1].end,
    });
    expect(runtime.search).toHaveBeenCalledTimes(2);
    expect(runtime.search).toHaveBeenNthCalledWith(1, {
      query: '第一行',
      caseSensitive: true,
      limit: 256,
    });
  });

  it('rebuilds persisted multi-line highlight geometry from matching source segments', async () => {
    const runtime = runtimeWithSearchResults([
      searchResult('第一行', 0, sourceRanges[0]),
      searchResult('第二行', 1, sourceRanges[1]),
    ]);
    const sourceRange = { start: sourceRanges[0].start, end: sourceRanges[1].end };
    const overlays = await resolveReaderHighlightOverlays(
      runtime,
      7,
      'chapter.xhtml',
      entries.map((entry) => ({ ...entry, sourcePoint: undefined })),
      [{
        id: 'highlight',
        bookId: 'book',
        href: 'chapter.xhtml',
        sourceRange,
        text: '第一行\n第二行',
        createdAt: 1,
      }],
      '#ffee00',
    );

    expect(overlays).toEqual([
      { revisionId: 7, bounds: entries[0].bounds, color: '#ffee00', radius: 2 },
      { revisionId: 7, bounds: entries[1].bounds, color: '#ffee00', radius: 2 },
    ]);
  });
});

function hit(text: string, lineIndex: number, y: number): ReaderHitEntry {
  return {
    pageIndex: 0,
    bounds: { x: 10, y, width: 60, height: 18 },
    text,
    textRange: {
      start: { blockIndex: 0, lineIndex, runIndex: 0, charIndex: 0 },
      end: { blockIndex: 0, lineIndex, runIndex: 0, charIndex: text.length },
    },
    sourcePoint: undefined,
  };
}

function searchResult(
  context: string,
  lineIndex: number,
  sourceRange: ReaderSourceRange,
): ReaderSearchResult {
  return {
    pageIndex: 0,
    spreadIndex: 0,
    start: { blockIndex: 0, lineIndex, runIndex: 0, charIndex: 0 },
    end: { blockIndex: 0, lineIndex, runIndex: 0, charIndex: context.length },
    context,
    locator: {
      spineIdref: 'chapter',
      manifestHref: 'chapter.xhtml',
      chapterProgress: 0,
      sourceRange,
    },
  };
}

function runtimeWithSearchResults(results: readonly ReaderSearchResult[]): ReaderRuntime {
  return {
    search: vi.fn(async ({ query }) => ({
      query,
      truncated: false,
      searchedPageCount: 1,
      scopeComplete: true,
      results: results.filter((result) => result.context === query),
    })),
    resolveTextRangeGeometry: vi.fn(async (request) => {
      const entry = entries.find((candidate) =>
        candidate.textRange?.start.lineIndex === request.start.lineIndex);
      return entry ? [{
        bounds: entry.bounds,
        blockIndex: request.start.blockIndex,
        lineIndex: request.start.lineIndex,
        runIndex: request.start.runIndex,
        startCharIndex: request.start.charIndex,
        endCharIndex: request.end.charIndex,
      }] : [];
    }),
  } as unknown as ReaderRuntime;
}
