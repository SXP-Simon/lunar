import type { ReaderHitEntry, ReaderSourceRange } from '../contracts';
import {
  createReaderTextSelectionFromRange,
  createReaderTextSelectionFromSourceRange,
  type ReaderTextSelection,
  type ReaderTextSelectionEndpoint,
  type ReaderTextSelectionRange,
} from './text-selection';

/** A sentence-sized piece of painted text on one frame. */
export interface ReaderTextSegment {
  readonly text: string;
  /** Hit-entry range; valid only for the entries the segment was created from. */
  readonly range: ReaderTextSelectionRange;
  /** Durable source range, present when every covered run carries a source point. */
  readonly sourceRange?: ReaderSourceRange;
}

/** Any of the identities a caller may hold for a piece of text, from most to least exact. */
export interface ReaderTextLocation {
  readonly range?: ReaderTextSelectionRange;
  readonly sourceRange?: ReaderSourceRange;
  readonly text: string;
}

const SentenceTerminators = new Set(['。', '！', '？', '!', '?', '；', ';', '…']);
const ClosingMarks = new Set(['」', '』', '”', '’', '）', ')', '】', '》', '"', "'", '…']);

/**
 * Splits the frame's text into sentences. Paragraph and page boundaries always
 * end a sentence, so segments never span blocks.
 */
export function createReaderTextSegments(entries: readonly ReaderHitEntry[]): readonly ReaderTextSegment[] {
  const segments: ReaderTextSegment[] = [];
  let start: ReaderTextSelectionEndpoint | undefined;
  let last: ReaderTextSelectionEndpoint | undefined;
  let previousEntry: ReaderHitEntry | undefined;

  const flush = (end: ReaderTextSelectionEndpoint | undefined) => {
    if (start && end) {
      const selection = createReaderTextSelectionFromRange(entries, { start, end });
      if (selection && selection.text.trim().length > 0) {
        segments.push({ text: selection.text, range: selection.range, sourceRange: selection.sourceRange });
      }
    }
    start = undefined;
  };

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex];
    if (entry.imageSource !== undefined || entry.text.length === 0) continue;
    if (previousEntry && startsNewBlock(previousEntry, entry)) flush(last);
    previousEntry = entry;
    const text = entry.text;
    for (let charIndex = 0; charIndex < text.length; charIndex += 1) {
      const char = text[charIndex];
      if (!start) {
        if (/\s/u.test(char)) continue;
        start = { entryIndex, charIndex };
      }
      last = { entryIndex, charIndex: charIndex + 1 };
      if (!isSentenceEnd(text, charIndex)) continue;
      let end = charIndex + 1;
      while (end < text.length && ClosingMarks.has(text[end])) end += 1;
      charIndex = end - 1;
      flush({ entryIndex, charIndex: end });
    }
  }
  flush(last);
  return segments;
}

/**
 * Locates text on the frame's entries: an exact source range first, then the
 * first whitespace-insensitive occurrence of the text. Page-local ranges are
 * the caller's to apply, because only the caller knows which frame they belong to.
 */
export function findReaderTextSelection(
  entries: readonly ReaderHitEntry[],
  location: ReaderTextLocation,
): ReaderTextSelection | undefined {
  if (location.sourceRange) {
    const sourceSelection = createReaderTextSelectionFromSourceRange(entries, location.sourceRange);
    if (sourceSelection && compactReaderText(sourceSelection.text) === compactReaderText(location.text)) {
      return sourceSelection;
    }
  }
  return findReaderTextSelectionByText(entries, location.text);
}

// Fragment artifacts expose the text runs and bounds but may omit durable
// source points. Matching the text keeps painting and hit testing usable while
// the exact source-range response is being projected.
export function findReaderTextSelectionByText(
  entries: readonly ReaderHitEntry[],
  text: string,
): ReaderTextSelection | undefined {
  const query = compactReaderText(text);
  if (!query) return undefined;

  const compactEntries: { readonly entryIndex: number; readonly charIndex: number; readonly char: string }[] = [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex];
    if (entry.imageSource !== undefined || entry.text.length === 0) continue;
    for (let charIndex = 0; charIndex < entry.text.length; charIndex += 1) {
      const char = entry.text[charIndex];
      if (!/\s/u.test(char)) compactEntries.push({ entryIndex, charIndex, char });
    }
  }

  const compactText = compactEntries.map((item) => item.char).join('');
  const start = compactText.indexOf(query);
  if (start < 0) return undefined;
  const first = compactEntries[start];
  const last = compactEntries[start + query.length - 1];
  if (!first || !last) return undefined;
  return createReaderTextSelectionFromRange(entries, {
    start: { entryIndex: first.entryIndex, charIndex: first.charIndex },
    end: { entryIndex: last.entryIndex, charIndex: last.charIndex + 1 },
  });
}

export function compactReaderText(text: string): string {
  return text.replace(/\s+/gu, '');
}

function startsNewBlock(previous: ReaderHitEntry, current: ReaderHitEntry): boolean {
  if (previous.pageIndex !== current.pageIndex) return true;
  const previousBlock = previous.textRange?.start.blockIndex;
  const currentBlock = current.textRange?.start.blockIndex;
  return previousBlock !== undefined && currentBlock !== undefined && previousBlock !== currentBlock;
}

function isSentenceEnd(text: string, index: number): boolean {
  const char = text[index];
  if (SentenceTerminators.has(char)) return true;
  // A Latin full stop ends a sentence only before whitespace or the end of the run.
  return char === '.' && (index + 1 >= text.length || /\s/u.test(text[index + 1]));
}
