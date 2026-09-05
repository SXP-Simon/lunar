import type { ReaderHitEntry, ReaderLocator, ReaderSourcePoint } from '@/reader';

export interface ReaderBookmark {
  readonly id: string;
  readonly bookId: string;
  readonly locator: ReaderLocator;
  readonly label: string;
  readonly text: string;
  readonly createdAt: number;
}

export function bookmarkLocationKey(locator: ReaderLocator): string {
  const point = locator.sourcePoint ?? locator.sourceRange?.start;
  return JSON.stringify([locator.manifestHref ?? locator.spineIdref,
    point ? [point.nodePath, point.textOffset] : [locator.anchorId ?? null, locator.chapterProgress]]);
}

export function isBookmarkOnPage(bookmark: ReaderBookmark, locator: ReaderLocator, entries: readonly ReaderHitEntry[]): boolean {
  if ((bookmark.locator.manifestHref ?? bookmark.locator.spineIdref) !== (locator.manifestHref ?? locator.spineIdref)) return false;
  if (bookmarkLocationKey(bookmark.locator) === bookmarkLocationKey(locator)) return true;
  const point = bookmark.locator.sourcePoint ?? bookmark.locator.sourceRange?.start;
  return Boolean(point && entries.some((entry) => entry.sourcePoint
    && sameNode(point, entry.sourcePoint)
    && point.textOffset >= entry.sourcePoint.textOffset
    && point.textOffset < entry.sourcePoint.textOffset + entry.text.length));
}

function sameNode(a: ReaderSourcePoint, b: ReaderSourcePoint) {
  return a.nodePath.length === b.nodePath.length && a.nodePath.every((part, index) => part === b.nodePath[index]);
}

export function parseBookmarkLocator(json: string): ReaderLocator | undefined {
  try {
    const value = JSON.parse(json) as ReaderLocator;
    if (!value || typeof value.spineIdref !== 'string'
      || (value.manifestHref !== undefined && typeof value.manifestHref !== 'string')
      || (value.anchorId !== undefined && typeof value.anchorId !== 'string')
      || !Number.isFinite(value.chapterProgress) || value.chapterProgress < 0 || value.chapterProgress > 1
      || (value.sourcePoint !== undefined && !validPoint(value.sourcePoint))
      || (value.sourceRange !== undefined && (!validPoint(value.sourceRange?.start) || !validPoint(value.sourceRange?.end)))) return undefined;
    return value;
  } catch { return undefined; }
}

function validPoint(point: ReaderSourcePoint): boolean {
  return Boolean(point && Array.isArray(point.nodePath)
    && point.nodePath.every((part) => Number.isSafeInteger(part) && part >= 0)
    && Number.isSafeInteger(point.textOffset) && point.textOffset >= 0);
}
