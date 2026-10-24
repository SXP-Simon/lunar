import { describe, expect, it } from 'vitest';
import { createReaderTextSegments, findReaderTextSelection, type ReaderHitEntry } from '../../src/reader';

function entry(text: string, block: number, line: number, x = 0, sourceOffset?: number): ReaderHitEntry {
  return {
    pageIndex: 0,
    bounds: { x, y: line * 20, width: text.length * 10, height: 18 },
    text,
    sourcePoint: sourceOffset === undefined ? undefined : { nodePath: [block], textOffset: sourceOffset },
    textRange: {
      start: { blockIndex: block, lineIndex: line, runIndex: 0, charIndex: 0 },
      end: { blockIndex: block, lineIndex: line, runIndex: 0, charIndex: text.length },
    },
  };
}

describe('reader text segments', () => {
  it('splits sentences across lines and keeps closing quotes with their sentence', () => {
    const entries = [entry('「你好。」她说', 0, 0, 0, 0), entry('道。今天', 0, 1, 0, 7), entry('天气好', 0, 2, 0, 11)];
    const segments = createReaderTextSegments(entries);
    expect(segments.map((segment) => segment.text)).toEqual(['「你好。」', '她说\n道。', '今天\n天气好']);
    expect(segments[0].range).toEqual({ start: { entryIndex: 0, charIndex: 0 }, end: { entryIndex: 0, charIndex: 5 } });
    expect(segments[0].sourceRange).toEqual({
      start: { nodePath: [0], textOffset: 0 },
      end: { nodePath: [0], textOffset: 5 },
    });
  });

  it('ends a segment at every paragraph and skips leading whitespace and images', () => {
    const image: ReaderHitEntry = { ...entry('', 1, 1), imageSource: 'cover.png' };
    const segments = createReaderTextSegments([entry('First line', 0, 0), image, entry('  Next. Done', 1, 2)]);
    expect(segments.map((segment) => segment.text)).toEqual(['First line', 'Next.', 'Done']);
    expect(segments[0].sourceRange).toBeUndefined();
  });

  it('does not split a Latin decimal point', () => {
    expect(createReaderTextSegments([entry('Version 3.2 ships. Yes', 0, 0)]).map((segment) => segment.text)).toEqual([
      'Version 3.2 ships.',
      'Yes',
    ]);
  });

  it('locates text by source range first and falls back to whitespace-insensitive text', () => {
    const entries = [entry('甲乙丙丁', 0, 0, 0, 0), entry('甲乙丙丁', 1, 1, 0, 0)];
    const bySource = findReaderTextSelection(entries, {
      text: '乙丙',
      sourceRange: { start: { nodePath: [1], textOffset: 1 }, end: { nodePath: [1], textOffset: 3 } },
    });
    expect(bySource?.range).toEqual({ start: { entryIndex: 1, charIndex: 1 }, end: { entryIndex: 1, charIndex: 3 } });

    const staleSource = findReaderTextSelection(entries, {
      text: '丙丁',
      sourceRange: { start: { nodePath: [1], textOffset: 0 }, end: { nodePath: [1], textOffset: 2 } },
    });
    expect(staleSource?.range).toEqual({
      start: { entryIndex: 0, charIndex: 2 },
      end: { entryIndex: 0, charIndex: 4 },
    });
    expect(findReaderTextSelection(entries, { text: '戊' })).toBeUndefined();
  });
});
