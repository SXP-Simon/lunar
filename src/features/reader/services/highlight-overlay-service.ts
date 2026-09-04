import {
  createReaderTextSelectionFromSourceRange,
  resolveReaderTextSelectionSegmentSourceRange,
  type ReaderHitEntry,
  type ReaderRuntime,
  type ReaderSearchResult,
  type ReaderSourcePoint,
  type ReaderSourceRange,
  type ReaderTextSelection,
} from '../../../reader';
import type { ReaderOverlayRect } from '../../../reader/native';

import type { ReaderHighlight } from '../domain/reader-highlight';

export async function resolveReaderSelectionSourceRange(
  runtime: ReaderRuntime,
  selection: ReaderTextSelection,
  href: string,
): Promise<ReaderSourceRange | undefined> {
  if (selection.sourceRange) return selection.sourceRange;
  if (
    selection.searchSegments.length === 0
    || selection.searchSegments.length !== selection.entries.length
  ) return undefined;

  const ranges: ReaderSourceRange[] = [];
  for (const segment of selection.searchSegments) {
    const response = await runtime.search({
      query: segment.text,
      caseSensitive: true,
      limit: 256,
    });
    const range = resolveReaderTextSelectionSegmentSourceRange(
      segment,
      response.results,
      href,
    );
    if (!range || !rangeFollows(ranges.at(-1), range)) return undefined;
    ranges.push(range);
  }

  const first = ranges[0];
  const last = ranges.at(-1);
  return first && last ? { start: first.start, end: last.end } : undefined;
}

export async function resolveReaderHighlightOverlays(
  runtime: ReaderRuntime,
  revisionId: number,
  href: string,
  entries: readonly ReaderHitEntry[],
  highlights: readonly ReaderHighlight[],
  color: string,
): Promise<readonly ReaderOverlayRect[]> {
  const pageIndexes = new Set(entries.map((entry) => entry.pageIndex));
  const overlays: ReaderOverlayRect[] = [];

  for (const highlight of highlights) {
    if (highlight.href !== href) continue;
    const localSelection = createReaderTextSelectionFromSourceRange(entries, highlight.sourceRange);
    if (localSelection) {
      overlays.push(...localSelection.bounds.map((bounds) => ({
        revisionId,
        bounds,
        color,
        radius: 2,
      })));
      continue;
    }

    const results = await resolveHighlightSegments(runtime, highlight, href, pageIndexes);
    for (const result of results) {
      const rects = await runtime.resolveTextRangeGeometry({
        pageIndex: result.pageIndex,
        start: result.start,
        end: result.end,
      });
      overlays.push(...rects.map((rect) => ({
        revisionId,
        bounds: rect.bounds,
        color,
        radius: 2,
      })));
    }
  }

  return overlays;
}

async function resolveHighlightSegments(
  runtime: ReaderRuntime,
  highlight: ReaderHighlight,
  href: string,
  pageIndexes: ReadonlySet<number>,
): Promise<readonly ReaderSearchResult[]> {
  const textSegments = highlight.text.replace(/\r\n?/gu, '\n').split('\n').filter(Boolean);
  if (textSegments.length === 0) return [];
  const responses = await Promise.all(textSegments.map((query) => runtime.search({
    query,
    caseSensitive: true,
    limit: 256,
  })));

  const selected: ReaderSearchResult[] = [];
  for (let index = 0; index < responses.length; index += 1) {
    const candidates = responses[index].results
      .filter((result) => result.locator?.manifestHref === href)
      .filter((result) => pageIndexes.has(result.pageIndex))
      .filter((result) => result.locator?.sourceRange
        && containsSourceRange(highlight.sourceRange, result.locator.sourceRange))
      .sort(compareSearchResultsBySource);
    const previousRange = selected.at(-1)?.locator?.sourceRange;
    const candidate = candidates.find((result) => {
      const range = result.locator?.sourceRange;
      if (!range || !rangeFollows(previousRange, range)) return false;
      if (index === 0 && !sameSourcePoint(range.start, highlight.sourceRange.start)) return false;
      return index !== responses.length - 1
        || sameSourcePoint(range.end, highlight.sourceRange.end);
    });
    if (!candidate) return [];
    selected.push(candidate);
  }
  return selected;
}

function containsSourceRange(container: ReaderSourceRange, value: ReaderSourceRange): boolean {
  return compareSourcePoints(container.start, value.start) <= 0
    && compareSourcePoints(value.end, container.end) <= 0;
}

function rangeFollows(previous: ReaderSourceRange | undefined, current: ReaderSourceRange): boolean {
  return !previous || compareSourcePoints(previous.end, current.start) <= 0;
}

function compareSearchResultsBySource(left: ReaderSearchResult, right: ReaderSearchResult): number {
  const leftRange = left.locator?.sourceRange;
  const rightRange = right.locator?.sourceRange;
  if (!leftRange || !rightRange) return 0;
  return compareSourcePoints(leftRange.start, rightRange.start);
}

function sameSourcePoint(left: ReaderSourcePoint, right: ReaderSourcePoint): boolean {
  return compareSourcePoints(left, right) === 0;
}

function compareSourcePoints(left: ReaderSourcePoint, right: ReaderSourcePoint): number {
  const length = Math.min(left.nodePath.length, right.nodePath.length);
  for (let index = 0; index < length; index += 1) {
    if (left.nodePath[index] !== right.nodePath[index]) {
      return left.nodePath[index] - right.nodePath[index];
    }
  }
  return left.nodePath.length === right.nodePath.length
    ? left.textOffset - right.textOffset
    : left.nodePath.length - right.nodePath.length;
}
