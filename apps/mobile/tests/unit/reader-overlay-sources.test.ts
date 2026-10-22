import { describe, expect, it, vi } from 'vitest';
import type { ReaderRenderFrame, ReaderSnapshot } from '@/reader';
import {
  createReaderOverlaySourcesResolver,
  resolveReaderCurrentOverlaySources,
  type ReaderOverlayRect,
  type ReaderOverlaySource,
} from '../../src/reader/skia/rendering/reader-overlays';

vi.mock('@shopify/react-native-skia', () => ({ PaintStyle: {}, Skia: {} }));

const snapshot = { phase: 'ready', revisionId: 1, spreadIndex: 0 } as ReaderSnapshot;
const frame = { spreadIndex: 0 } as ReaderRenderFrame;

function overlay(x: number, color: string): ReaderOverlayRect {
  return { revisionId: 1, bounds: { x, y: 0, width: 10, height: 10 }, color };
}

describe('reader overlay sources', () => {
  const highlights: ReaderOverlaySource = { key: 'highlights', resolvePage: () => [overlay(0, 'yellow')] };
  const decorations: ReaderOverlaySource = { key: 'decorations', resolvePage: () => [overlay(20, 'blue')] };

  it('merges every source for pages painted during a turn', () => {
    const resolve = createReaderOverlaySourcesResolver([highlights, decorations, { key: 'empty' }]);
    expect(resolve?.(snapshot, frame).map((item) => item.color)).toEqual(['yellow', 'blue']);
    expect(createReaderOverlaySourcesResolver([{ key: 'empty' }])).toBeUndefined();
    expect(createReaderOverlaySourcesResolver([highlights])).toBe(highlights.resolvePage);
  });

  it('lets a refined current result replace only its own source', () => {
    const refined = { ...highlights, current: [overlay(1, 'exact')] };
    expect(
      resolveReaderCurrentOverlaySources([refined, decorations], snapshot, frame).map((item) => item.color),
    ).toEqual(['exact', 'blue']);
  });

  it('keeps the page result when a refinement is empty and paints nothing without a frame', () => {
    const empty = { ...highlights, current: [] };
    expect(resolveReaderCurrentOverlaySources([empty], snapshot, frame).map((item) => item.color)).toEqual(['yellow']);
    expect(resolveReaderCurrentOverlaySources([highlights], snapshot, undefined)).toEqual([]);
    expect(resolveReaderCurrentOverlaySources(undefined, snapshot, frame)).toEqual([]);
  });
});
