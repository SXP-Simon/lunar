import type { SQLiteDatabase } from 'expo-sqlite';

import type { ReaderSourcePoint, ReaderSourceRange } from '@/reader';
import { ReaderHighlightColors, type ReaderHighlight, type ReaderHighlightColor } from '../domain/reader-highlight';
import type { HighlightRepository } from './highlight-repository';

interface HighlightRow {
  readonly id: string;
  readonly book_id: string;
  readonly href: string;
  readonly source_range_json: string;
  readonly text: string;
  readonly created_at: number;
  readonly color: string;
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
        color: ReaderHighlightColors.includes(row.color as ReaderHighlightColor)
          ? row.color as ReaderHighlightColor : 'yellow',
      }] : [];
    });
  }

  async save(highlight: ReaderHighlight): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO reader_highlights (
        id, book_id, href, source_range_json, text, created_at, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id, href, source_range_json) DO UPDATE SET
        id = excluded.id,
        text = excluded.text,
        created_at = excluded.created_at,
        color = excluded.color`,
      highlight.id,
      highlight.bookId,
      highlight.href,
      JSON.stringify(highlight.sourceRange),
      highlight.text,
      highlight.createdAt,
      highlight.color ?? 'yellow',
    );
  }

  async replace(highlight: ReaderHighlight, removedIds: readonly string[]): Promise<void> {
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const repository = new SQLiteHighlightRepository(transaction);
      await repository.remove(highlight.bookId, removedIds);
      await repository.save(highlight);
    });
  }

  async remove(bookId: string, ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.database.runAsync('DELETE FROM reader_highlights WHERE book_id = ? AND id = ?', bookId, id);
    }
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
