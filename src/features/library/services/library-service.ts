import { getLunarDatabase } from '../../../db';

import type { LibraryBookRecord } from '../domain/library-book';
import { ExpoBookFileService } from '../infrastructure/expo-book-file-service';
import { pickEpubs, type PickedEpub } from '../infrastructure/epub-picker';
import { SQLiteBookRepository } from '../repositories/sqlite-book-repository';
import { SQLiteBookAssetRepository } from '../repositories/sqlite-book-asset-repository';
import { BookImportService } from './book-import-service';
import type { BookImportProgressHandler } from './book-file-service';

export async function selectEpubFiles(): Promise<readonly PickedEpub[]> {
  return pickEpubs();
}

export async function importEpubFile(
  file: PickedEpub,
  onProgress?: BookImportProgressHandler,
): Promise<LibraryBookRecord> {
  const database = await getLunarDatabase();
  const importer = new BookImportService({
    files: new ExpoBookFileService(),
    books: new SQLiteBookRepository(database),
    assets: new SQLiteBookAssetRepository(database),
  });
  return importer.import(file.uri, file.fileName, onProgress);
}

export async function listLibraryBooks(): Promise<readonly LibraryBookRecord[]> {
  const database = await getLunarDatabase();
  const books = new SQLiteBookRepository(database);
  const files = new ExpoBookFileService();
  const importer = new BookImportService({ files, books });
  const records = await books.list();
  const hydrated: LibraryBookRecord[] = [];
  for (const record of records) {
    try {
      hydrated.push(await importer.ensureMetadata(record));
    } catch {
      hydrated.push(record);
    }
  }
  return hydrated;
}

export async function findLibraryBookById(
  bookId: string,
): Promise<LibraryBookRecord | undefined> {
  const database = await getLunarDatabase();
  return new SQLiteBookRepository(database).findById(bookId);
}
