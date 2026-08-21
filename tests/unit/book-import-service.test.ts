import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { BookRepository, LibraryBookRecord } from '../../src/db/book-repository';
import { BookImportService } from '../../src/services/book-import-service';
import type {
  BookFileService,
  ManagedBookFile,
} from '../../src/services/book-file-service';

const fixtureDirectory = resolve('tests/fixtures');
const fixtureName = readdirSync(fixtureDirectory).find((name) => name.endsWith('.epub'));

describe('BookImportService', () => {
  it('validates the managed EPUB and saves its package metadata', async () => {
    const data = readFixture();
    const managedFile: ManagedBookFile = {
      bookId: 'fixture-sha256',
      uri: 'file:///documents/books/fixture-sha256/book.epub',
      fileName: fixtureName!,
      fileSize: data.byteLength,
      sha256: 'fixture-sha256',
    };
    const files: BookFileService = {
      importEpub: vi.fn(async () => managedFile),
      readBook: vi.fn(async () => data),
      removeBook: vi.fn(async () => undefined),
    };
    const books = new MemoryBookRepository();
    const importer = new BookImportService({
      files,
      books,
      now: () => 1_777_777,
    });

    const book = await importer.import('file:///cache/fixture.epub', fixtureName!);

    expect(book).toMatchObject({
      id: 'fixture-sha256',
      title: '我买下了与她的每周密会～以五千圆为借口，共度两人时光～ 第三卷',
      author: '羽田宇佐',
      language: 'zh',
      epubIdentifier: 'calibre:23961',
      fileSize: data.byteLength,
      addedAt: 1_777_777,
      updatedAt: 1_777_777,
    });
    await expect(books.findBySha256('fixture-sha256')).resolves.toEqual(book);
    expect(files.removeBook).not.toHaveBeenCalled();
  });

  it('removes a new managed file when EPUB validation fails', async () => {
    const managedFile: ManagedBookFile = {
      bookId: 'invalid',
      uri: 'file:///documents/books/invalid/book.epub',
      fileName: 'invalid.epub',
      fileSize: 0,
      sha256: 'invalid',
    };
    const files: BookFileService = {
      importEpub: vi.fn(async () => managedFile),
      readBook: vi.fn(async () => new ArrayBuffer(0)),
      removeBook: vi.fn(async () => undefined),
    };
    const importer = new BookImportService({
      files,
      books: new MemoryBookRepository(),
    });

    await expect(importer.import('file:///cache/invalid.epub', 'invalid.epub')).rejects.toThrow();
    expect(files.removeBook).toHaveBeenCalledWith(managedFile);
  });
});

class MemoryBookRepository implements BookRepository {
  private readonly records = new Map<string, LibraryBookRecord>();

  async save(book: LibraryBookRecord): Promise<void> {
    this.records.set(book.id, book);
  }

  async findById(id: string): Promise<LibraryBookRecord | undefined> {
    return this.records.get(id);
  }

  async findBySha256(sha256: string): Promise<LibraryBookRecord | undefined> {
    return Array.from(this.records.values()).find((book) => book.sha256 === sha256);
  }

  async list(): Promise<readonly LibraryBookRecord[]> {
    return Array.from(this.records.values());
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}

function readFixture(): ArrayBuffer {
  if (!fixtureName) {
    throw new Error('An EPUB fixture is required for the import test.');
  }
  const data = readFileSync(resolve(fixtureDirectory, fixtureName));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}
