import { describe, expect, it } from 'vitest';
import {
  isReaderPageInteractive,
  resolveReaderInteraction,
  type ReaderInteractionInput,
} from '../../src/features/reader/domain/reader-interaction';

const idle: ReaderInteractionInput = {
  isReady: true,
  isSettling: false,
  automaticNavigationActive: false,
  hasSelection: false,
  hasPanel: false,
  hasModal: false,
};

describe('reader interaction', () => {
  it('allows every interaction on an idle ready page', () => {
    expect(resolveReaderInteraction(idle)).toEqual({
      mode: 'idle',
      canInteractWithPage: true,
      canOpenContent: true,
      canNavigate: true,
    });
  });

  it('blocks page gestures until the page is ready and no turn is in flight', () => {
    expect(isReaderPageInteractive({ ...idle, isReady: false })).toBe(false);
    expect(isReaderPageInteractive({ ...idle, isSettling: true })).toBe(false);
    expect(isReaderPageInteractive({ ...idle, automaticNavigationActive: true })).toBe(false);
    expect(resolveReaderInteraction({ ...idle, isSettling: true })).toMatchObject({
      mode: 'turning',
      canInteractWithPage: false,
      canNavigate: false,
    });
  });

  it('keeps the page interactive under a selection but stops content and navigation', () => {
    expect(resolveReaderInteraction({ ...idle, hasSelection: true })).toEqual({
      mode: 'selecting',
      canInteractWithPage: true,
      canOpenContent: false,
      canNavigate: false,
    });
  });

  it('reports the most exclusive surface as the mode', () => {
    expect(resolveReaderInteraction({ ...idle, hasPanel: true, hasSelection: true }).mode).toBe('panel');
    expect(resolveReaderInteraction({ ...idle, hasPanel: true, hasModal: true }).mode).toBe('modal');
    expect(resolveReaderInteraction({ ...idle, isReady: false, hasModal: true }).mode).toBe('loading');
    expect(resolveReaderInteraction({ ...idle, hasPanel: true }).canNavigate).toBe(false);
    expect(resolveReaderInteraction({ ...idle, hasModal: true }).canOpenContent).toBe(true);
  });
});
