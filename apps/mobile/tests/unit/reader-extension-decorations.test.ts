import { describe, expect, it } from 'vitest';
import type { ReaderHitEntry, ReaderRenderFrame, ReaderSnapshot } from '@/reader';
import { createReaderExtensionDecorationResolver } from '../../src/features/reader/services/extension-decoration-overlays';

const colors = {
  yellow: { fill: 'y', ink: 'Y' },
  pink: { fill: 'p', ink: 'P' },
  purple: { fill: 'u', ink: 'U' },
  blue: { fill: 'b', ink: 'B' },
  green: { fill: 'g', ink: 'G' },
  accent: { fill: 'a', ink: 'A' },
};

function hit(text: string, x: number): ReaderHitEntry {
  return {
    pageIndex: 0,
    bounds: { x, y: 0, width: text.length * 10, height: 20 },
    text,
    textRange: {
      start: { blockIndex: 0, lineIndex: 0, runIndex: 0, charIndex: 0 },
      end: { blockIndex: 0, lineIndex: 0, runIndex: 0, charIndex: text.length },
    },
  };
}

const frame = {
  spreadIndex: 0,
  manifestHref: 'c1.xhtml',
  renderKey: 'frame-1',
  pageIndices: [0],
  width: 100,
  height: 100,
  imageSources: [],
  displayList: [],
  hits: [hit('甲乙丙', 0), hit('甲乙丙', 40)],
} as unknown as ReaderRenderFrame;
const snapshot = { phase: 'ready', revisionId: 4, spreadIndex: 0 } as ReaderSnapshot;

describe('reader extension decorations', () => {
  it('uses the exact page range on its own frame and text matching elsewhere', () => {
    const resolve = createReaderExtensionDecorationResolver(
      [
        {
          key: 'exact',
          href: 'c1.xhtml',
          frameKey: 'frame-1',
          revisionId: 4,
          range: { start: { entryIndex: 1, charIndex: 0 }, end: { entryIndex: 1, charIndex: 1 } },
          text: '甲',
          style: 'background',
          color: 'yellow',
        },
      ],
      colors,
    )!;
    expect(resolve(snapshot, frame).map((overlay) => overlay.bounds.x)).toEqual([40]);
    // After a reflow the page-local range is stale; the text fallback finds the first occurrence.
    expect(resolve({ ...snapshot, revisionId: 5 }, frame).map((overlay) => overlay.bounds.x)).toEqual([0]);
  });

  it('maps styles to fills, outlines and ink lines and skips other chapters', () => {
    const resolve = createReaderExtensionDecorationResolver(
      [
        { key: 'a', text: '乙', style: 'wavy', color: 'accent' },
        { key: 'b', text: '丙', style: 'outline', color: 'blue' },
        { key: 'c', text: '甲', href: 'c2.xhtml', style: 'background', color: 'green' },
      ],
      colors,
    )!;
    expect(resolve(snapshot, frame).map(({ color, decoration, outline }) => ({ color, decoration, outline }))).toEqual([
      { color: 'A', decoration: 'wavy', outline: undefined },
      { color: 'B', decoration: undefined, outline: true },
    ]);
  });

  it('has no resolver without decorations', () => {
    expect(createReaderExtensionDecorationResolver([], colors)).toBeUndefined();
  });
});
