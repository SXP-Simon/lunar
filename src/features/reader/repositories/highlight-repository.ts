import type { ReaderHighlight } from '../domain/reader-highlight';

export interface HighlightRepository {
  listByBookId(bookId: string): Promise<readonly ReaderHighlight[]>;
  save(highlight: ReaderHighlight): Promise<void>;
}
