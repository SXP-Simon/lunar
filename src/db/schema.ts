export const LUNAR_DATABASE_NAME = 'lunar.db';

export interface DatabaseMigration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    version: 1,
    name: 'create_library',
    statements: [
      `CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        language TEXT,
        epub_identifier TEXT NOT NULL,
        publisher TEXT,
        description TEXT,
        file_uri TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL CHECK (file_size >= 0),
        sha256 TEXT NOT NULL,
        cover_uri TEXT,
        added_at INTEGER NOT NULL,
        last_opened_at INTEGER,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE UNIQUE INDEX IF NOT EXISTS books_sha256_unique ON books(sha256)',
      `CREATE TABLE IF NOT EXISTS reading_states (
        book_id TEXT PRIMARY KEY NOT NULL,
        locator_json TEXT NOT NULL,
        fallback_progression REAL NOT NULL DEFAULT 0,
        current_page INTEGER,
        total_pages INTEGER,
        typography_json TEXT NOT NULL,
        theme TEXT NOT NULL,
        rito_version TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY NOT NULL,
        book_id TEXT NOT NULL,
        locator_json TEXT NOT NULL,
        label TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS bookmarks_book_id_index ON bookmarks(book_id)',
    ],
  },
];
