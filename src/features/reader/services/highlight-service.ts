import { randomUUID } from 'expo-crypto';

import { getLunarDatabase } from '@/db';
import type { ReaderSourceRange } from '@/reader';
import type { ReaderHighlight } from '../domain/reader-highlight';
import { SQLiteHighlightRepository } from '../repositories/sqlite-highlight-repository';

export interface CreateReaderHighlightInput {
  readonly bookId: string;
  readonly href: string;
  readonly sourceRange: ReaderSourceRange;
  readonly text: string;
}

export async function listReaderHighlights(bookId: string): Promise<readonly ReaderHighlight[]> {
  const database = await getLunarDatabase();
  return new SQLiteHighlightRepository(database).listByBookId(bookId);
}

export async function createReaderHighlight(
  input: CreateReaderHighlightInput,
): Promise<ReaderHighlight> {
  const highlight: ReaderHighlight = {
    ...input,
    id: randomUUID(),
    createdAt: Date.now(),
  };
  const database = await getLunarDatabase();
  await new SQLiteHighlightRepository(database).save(highlight);
  return highlight;
}
