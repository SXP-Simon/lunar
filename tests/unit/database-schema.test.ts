import { describe, expect, it } from 'vitest';

import { DATABASE_MIGRATIONS } from '../../src/db/schema';

describe('database schema', () => {
  it('creates metadata, reading state, and bookmark storage', () => {
    const sql = DATABASE_MIGRATIONS.flatMap((migration) => migration.statements).join('\n');

    expect(DATABASE_MIGRATIONS.map((migration) => migration.version)).toEqual([1, 2]);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS books');
    expect(sql).toContain('epub_identifier TEXT NOT NULL');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS books_sha256_unique');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS reading_states');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS bookmarks');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('metadata_version INTEGER NOT NULL DEFAULT 1');
  });
});
