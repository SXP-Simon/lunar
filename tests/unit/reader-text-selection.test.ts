import { describe, expect, it } from 'vitest';

import type { ReaderHitEntry } from '../../src/reader';
import {
  createReaderTextSelection,
  createReaderWordSelectionAtPoint,
  findReaderHitIndex,
  findSelectableReaderHitIndex,
  updateReaderTextSelectionAtPoint,
} from '../../src/reader/interaction/text-selection';

const entries: ReaderHitEntry[] = [
  { pageIndex: 0, bounds: { x: 10, y: 20, width: 40, height: 16 }, text: 'First ', textRange: { start: { blockIndex: 0, lineIndex: 0, runIndex: 0, charIndex: 0 }, end: { blockIndex: 0, lineIndex: 0, runIndex: 0, charIndex: 6 } } },
  { pageIndex: 0, bounds: { x: 50, y: 20, width: 40, height: 16 }, text: 'line', textRange: { start: { blockIndex: 0, lineIndex: 0, runIndex: 1, charIndex: 0 }, end: { blockIndex: 0, lineIndex: 0, runIndex: 1, charIndex: 4 } } },
  { pageIndex: 0, bounds: { x: 10, y: 42, width: 60, height: 16 }, text: 'Second', textRange: { start: { blockIndex: 0, lineIndex: 1, runIndex: 0, charIndex: 0 }, end: { blockIndex: 0, lineIndex: 1, runIndex: 0, charIndex: 6 } } },
  { pageIndex: 0, bounds: { x: 80, y: 42, width: 20, height: 20 }, text: '', imageSource: 'image.png' },
];

describe('reader text selection', () => {
  it('finds the uppermost hit in display-list coordinates', () => {
    expect(findReaderHitIndex(entries, 55, 25)).toBe(1);
    expect(findReaderHitIndex(entries, 5, 5)).toBeUndefined();
  });

  it('uses a nearby text hit while a selection finger passes through spacing', () => {
    expect(findSelectableReaderHitIndex(entries, 8, 45)).toBe(2);
    expect(findSelectableReaderHitIndex(entries, 500, 500)).toBeUndefined();
  });

  it('creates forward and backward selections with visual line breaks', () => {
    expect(createReaderTextSelection(entries, 0, 2)?.text).toBe('First line\nSecond');
    expect(createReaderTextSelection(entries, 2, 0)?.entries).toHaveLength(3);
  });

  it('excludes image hits from copied text and overlay geometry', () => {
    const selection = createReaderTextSelection(entries, 2, 3);
    expect(selection?.text).toBe('Second');
    expect(selection?.bounds).toEqual([entries[2].bounds]);
  });

  it('starts at a word and extends by character with Rito geometry positions', () => {
    const initial = createReaderWordSelectionAtPoint(entries, 70, 25);
    expect(initial?.text).toBe('line');
    expect(initial?.geometryRequests).toEqual([{
      pageIndex: 0,
      start: { blockIndex: 0, lineIndex: 0, runIndex: 1, charIndex: 0 },
      end: { blockIndex: 0, lineIndex: 0, runIndex: 1, charIndex: 4 },
    }]);
    const extended = initial
      ? updateReaderTextSelectionAtPoint(entries, initial, 40, 49)
      : undefined;
    expect(extended?.text).toBe('line\nSec');
  });
});
