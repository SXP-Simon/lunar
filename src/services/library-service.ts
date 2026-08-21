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
    return await new SQLiteBookRepository(database).list();
  } finally {
    await database.closeAsync();
  }
}
