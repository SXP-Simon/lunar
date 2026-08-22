import {
  openLunarDatabase,
  SQLiteBookRepository,
  type LibraryBookRecord,
} from '../db';
import { BookImportService } from './book-import-service';
import { pickEpub } from './epub-picker';
import { ExpoBookFileService } from './expo-book-file-service';

export async function pickAndImportEpub(): Promise<LibraryBookRecord | undefined> {
  const picked = await pickEpub();
  if (!picked) {
    return undefined;
  }

  const database = await openLunarDatabase();
  try {
    const importer = new BookImportService({
      files: new ExpoBookFileService(),
      books: new SQLiteBookRepository(database),
    });
    return await importer.import(picked.uri, picked.fileName);
  } finally {
    await database.closeAsync();
  }
}

export async function listLibraryBooks(): Promise<readonly LibraryBookRecord[]> {
  const database = await openLunarDatabase();
  try {
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
  } finally {
    await database.closeAsync();
  }
}
