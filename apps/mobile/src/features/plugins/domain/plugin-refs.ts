import type { ReaderLocator, ReaderSourcePoint, ReaderSourceRange, ReaderTextSelectionRange } from '@/reader';

// Opaque references handed to plugins. They are versioned and carry the book
// they belong to, so a reference can never be applied to a different book.

const RangePrefix = 'lr1:';
const LocatorPrefix = 'll1:';

export interface PluginRangeRef {
  readonly bookId: string;
  readonly href?: string;
  readonly text: string;
  /** Painted frame the page-local range was measured on. */
  readonly frameKey?: string;
  readonly revisionId?: number;
  readonly range?: ReaderTextSelectionRange;
  readonly sourceRange?: ReaderSourceRange;
}

export function encodeRangeRef(ref: PluginRangeRef): string {
  return `${RangePrefix}${encodeURIComponent(JSON.stringify(ref))}`;
}

export function decodeRangeRef(value: unknown): PluginRangeRef | undefined {
  const parsed = decode(value, RangePrefix);
  if (!parsed || typeof parsed.bookId !== 'string' || typeof parsed.text !== 'string') return undefined;
  if (parsed.href !== undefined && typeof parsed.href !== 'string') return undefined;
  if (parsed.frameKey !== undefined && typeof parsed.frameKey !== 'string') return undefined;
  if (parsed.revisionId !== undefined && !Number.isInteger(parsed.revisionId)) return undefined;
  if (parsed.range !== undefined && !isSelectionRange(parsed.range)) return undefined;
  if (parsed.sourceRange !== undefined && !isSourceRange(parsed.sourceRange)) return undefined;
  return parsed as unknown as PluginRangeRef;
}

export interface PluginLocatorRef {
  readonly bookId: string;
  readonly locator: ReaderLocator;
}

export function encodeLocatorRef(ref: PluginLocatorRef): string {
  return `${LocatorPrefix}${encodeURIComponent(JSON.stringify(ref))}`;
}

export function decodeLocatorRef(value: unknown): PluginLocatorRef | undefined {
  const parsed = decode(value, LocatorPrefix);
  if (!parsed || typeof parsed.bookId !== 'string' || !isLocator(parsed.locator)) return undefined;
  return parsed as unknown as PluginLocatorRef;
}

function decode(value: unknown, prefix: string): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || !value.startsWith(prefix) || value.length > 64 * 1024) return undefined;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value.slice(prefix.length)));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isSelectionRange(value: unknown): value is ReaderTextSelectionRange {
  const isEndpoint = (endpoint: unknown) =>
    isRecord(endpoint) && isIndex(endpoint.entryIndex) && isIndex(endpoint.charIndex);
  return isRecord(value) && isEndpoint(value.start) && isEndpoint(value.end);
}

function isSourcePoint(value: unknown): value is ReaderSourcePoint {
  return isRecord(value) && Array.isArray(value.nodePath) && value.nodePath.every(isIndex) && isIndex(value.textOffset);
}

function isSourceRange(value: unknown): value is ReaderSourceRange {
  return isRecord(value) && isSourcePoint(value.start) && isSourcePoint(value.end);
}

function isLocator(value: unknown): value is ReaderLocator {
  return (
    isRecord(value) &&
    typeof value.spineIdref === 'string' &&
    typeof value.chapterProgress === 'number' &&
    Number.isFinite(value.chapterProgress) &&
    (value.manifestHref === undefined || typeof value.manifestHref === 'string') &&
    (value.anchorId === undefined || typeof value.anchorId === 'string') &&
    (value.sourcePoint === undefined || isSourcePoint(value.sourcePoint)) &&
    (value.sourceRange === undefined || isSourceRange(value.sourceRange))
  );
}
