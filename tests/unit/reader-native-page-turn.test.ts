import { describe, expect, it } from 'vitest';

import {
  nativeAutomaticPageTurnBaseContent,
  nativeAutomaticPageTurnFaces,
  nativeAutomaticPageTurnId,
  readerAutomaticPageTurnId,
} from '../../src/reader/skia/anime/native-page-turn';
import type {
  ReaderAutomaticTurn,
  ReaderPageContent,
} from '../../src/reader/skia/anime/page-transition';

function turn(direction: 1 | -1): ReaderAutomaticTurn {
  return {
    id: 7,
    from: { key: 'from' } as ReaderPageContent,
    to: { key: 'to' } as ReaderPageContent,
    direction,
  };
}

describe('reader native automatic page turn', () => {
  it('maps forward and backward sheets to the native front and background', () => {
    const forward = nativeAutomaticPageTurnFaces(turn(1));
    const backward = nativeAutomaticPageTurnFaces(turn(-1));

    expect([forward.front.key, forward.background.key]).toEqual(['from', 'to']);
    expect([backward.front.key, backward.background.key]).toEqual(['to', 'from']);
  });

  it('round trips valid native turn identifiers', () => {
    const nativeId = nativeAutomaticPageTurnId(42);

    expect(nativeId).toBe('lunar-automatic:42');
    expect(readerAutomaticPageTurnId(nativeId)).toBe(42);
  });

  it('rejects malformed native turn identifiers', () => {
    expect(readerAutomaticPageTurnId('other:42')).toBeUndefined();
    expect(readerAutomaticPageTurnId('lunar-automatic:0')).toBeUndefined();
    expect(readerAutomaticPageTurnId('lunar-automatic:1.5')).toBeUndefined();
    expect(readerAutomaticPageTurnId('lunar-automatic:text')).toBeUndefined();
  });

  it('keeps the source below native animation until its first frame is presented', () => {
    const source = { key: 'source' } as ReaderPageContent;
    const target = { key: 'target' } as ReaderPageContent;
    const current = { key: 'current' } as ReaderPageContent;
    const turns: readonly ReaderAutomaticTurn[] = [{
      id: 1,
      from: source,
      to: target,
      direction: 1,
    }];

    expect(nativeAutomaticPageTurnBaseContent(turns, current, false)).toBe(source);
    expect(nativeAutomaticPageTurnBaseContent(turns, current, true)).toBe(current);
  });

  it('uses current content when native animation is idle', () => {
    const current = { key: 'current' } as ReaderPageContent;

    expect(nativeAutomaticPageTurnBaseContent([], current, false)).toBe(current);
  });
});
