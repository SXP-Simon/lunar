import { useCallback, useEffect, useState } from 'react';

import type { ReaderSourceRange } from '@/reader';
import type { ReaderHighlight } from '../domain/reader-highlight';
import {
  createReaderHighlight,
  listReaderHighlights,
} from '../services/highlight-service';

interface AddReaderHighlightInput {
  readonly href: string;
  readonly sourceRange: ReaderSourceRange;
  readonly text: string;
}

export function useReaderHighlights(bookId: string) {
  const [state, setState] = useState<{
    readonly bookId: string;
    readonly highlights: readonly ReaderHighlight[];
  }>({ bookId: '', highlights: [] });

  useEffect(() => {
    let active = true;
    listReaderHighlights(bookId)
      .then((highlights) => {
        if (active) setState({ bookId, highlights });
      })
      .catch(() => {
        if (active) setState({ bookId, highlights: [] });
      });
    return () => {
      active = false;
    };
  }, [bookId]);

  const addHighlight = useCallback(async (input: AddReaderHighlightInput) => {
    const highlight = await createReaderHighlight({ ...input, bookId });
    setState((current) => ({
      bookId,
      highlights: [
        ...(current.bookId === bookId ? current.highlights : []).filter((item) =>
          item.href !== highlight.href
          || JSON.stringify(item.sourceRange) !== JSON.stringify(highlight.sourceRange)),
        highlight,
      ],
    }));
    return highlight;
  }, [bookId]);

  return {
    highlights: state.bookId === bookId ? state.highlights : [],
    addHighlight,
  };
}
