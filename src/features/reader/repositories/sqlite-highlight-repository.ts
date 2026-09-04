import type { SQLiteDatabase } from 'expo-sqlite';

import type { ReaderSourcePoint, ReaderSourceRange } from '@/reader';
import type { ReaderHighlight } from '../domain/reader-highlight';
import type { HighlightRepository } from './highlight-repository';

interface HighlightRow {
  readonly id: string;
  readonly book_id: string;
  readonly href: string;
  readonly source_range_json: string;
  readonly text: string;
  readonly created_at: number;
}

export class SQLiteHighlightRepository implements HighlightRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async listByBookId(bookId: string): Promise<readonly ReaderHighlight[]> {
    const rows = await this.database.getAllAsync<HighlightRow>(
      'SELECT * FROM reader_highlights WHERE book_id = ? ORDER BY created_at ASC',
      bookId,
    );
    return rows.flatMap((row) => {
      const sourceRange = parseSourceRange(row.source_range_json);
      return sourceRange ? [{
        id: row.id,
        bookId: row.book_id,
        href: row.href,
        sourceRange,
        text: row.text,
        createdAt: row.created_at,
      }] : [];
    });
  }

  async save(highlight: ReaderHighlight): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO reader_highlights (
        id, book_id, href, source_range_json, text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id, href, source_range_json) DO UPDATE SET
        id = excluded.id,
        text = excluded.text,
        created_at = excluded.created_at`,
      highlight.id,
      highlight.bookId,
      highlight.href,
      JSON.stringify(highlight.sourceRange),
      highlight.text,
      highlight.createdAt,
    );
  }
}

function parseSourceRange(value: string): ReaderSourceRange | undefined {
  try {
    const parsed = JSON.parse(value) as { readonly start?: unknown; readonly end?: unknown };
    const start = parseSourcePoint(parsed.start);
    const end = parseSourcePoint(parsed.end);
    return start && end ? { start, end } : undefined;
  } catch {
    return undefined;
  }
}

function parseSourcePoint(value: unknown): ReaderSourcePoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const point = value as { readonly nodePath?: unknown; readonly textOffset?: unknown };
  if (
    !Array.isArray(point.nodePath)
    || !point.nodePath.every((part) => Number.isSafeInteger(part) && part >= 0)
    || !Number.isSafeInteger(point.textOffset)
    || Number(point.textOffset) < 0
  ) return undefined;
  return {
    nodePath: point.nodePath as number[],
    textOffset: Number(point.textOffset),
  };
}
