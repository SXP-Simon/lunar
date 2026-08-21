import type { BookRepository, LibraryBookRecord } from '../db';
import { inspectReaderBook, type ReaderBookMetadata } from '../reader';

import type { BookFileService, ManagedBookFile } from './book-file-service';

export type EpubInspector = (data: ArrayBuffer) => ReaderBookMetadata;

export interface BookImportServiceOptions {
  readonly files: BookFileService;
  readonly books: BookRepository;
  readonly inspectEpub?: EpubInspector;
  readonly now?: () => number;
}

export class BookImportService {
  private readonly files: BookFileService;
  private readonly books: BookRepository;
  private readonly inspectEpub: EpubInspector;
  private readonly now: () => number;

  constructor(options: BookImportServiceOptions) {
    this.files = options.files;
    this.books = options.books;
    this.inspectEpub = options.inspectEpub ?? inspectReaderBook;
    this.now = options.now ?? Date.now;
  }

  async import(sourceUri: string, fileName: string): Promise<LibraryBookRecord> {
    const managedFile = await this.files.importEpub(sourceUri, fileName);
    const previous = await this.books.findBySha256(managedFile.sha256);

    try {
      const metadata = this.inspectEpub(await this.files.readBook(managedFile));
      const timestamp = this.now();
      const book = toLibraryBook(managedFile, metadata, timestamp, previous);
      await this.books.save(book);
      return book;
    } catch (error) {
      if (!previous) {
        await this.files.removeBook(managedFile).catch(() => undefined);
      }
      throw error;
    }
  }
}

function toLibraryBook(
  file: ManagedBookFile,
  metadata: ReaderBookMetadata,
  timestamp: number,
  previous?: LibraryBookRecord,
): LibraryBookRecord {
  return {
    id: previous?.id ?? file.bookId,
    title: metadata.title,
    author: metadata.creator,
    language: metadata.language,
    epubIdentifier: metadata.identifier,
    fileUri: file.uri,
    fileName: file.fileName,
    fileSize: file.fileSize,
    sha256: file.sha256,
    coverUri: previous?.coverUri,
    addedAt: previous?.addedAt ?? timestamp,
    lastOpenedAt: previous?.lastOpenedAt,
    updatedAt: timestamp,
  };
}
