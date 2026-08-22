import {
  inspectReaderBookAssets,
  type ReaderBookInspection,
} from '../../../reader';

import type { LibraryBookRecord } from '../domain/library-book';
import type { BookRepository } from '../repositories/book-repository';
import type { BookFileService, ManagedBookFile } from './book-file-service';

export const CURRENT_BOOK_METADATA_VERSION = 2;

export type EpubInspector = (data: ArrayBuffer) => ReaderBookInspection;

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
    this.inspectEpub = options.inspectEpub ?? inspectReaderBookAssets;
    this.now = options.now ?? Date.now;
  }

  async import(sourceUri: string, fileName: string): Promise<LibraryBookRecord> {
    const managedFile = await this.files.importEpub(sourceUri, fileName);
    const previous = await this.books.findBySha256(managedFile.sha256);

    try {
      const inspection = this.inspectEpub(await this.files.readBook(managedFile));
      const coverUri = inspection.cover
        ? await this.files.saveCover(managedFile, inspection.cover)
        : previous?.coverUri;
      const timestamp = this.now();
      const book = toLibraryBook(
        managedFile,
        inspection,
        coverUri,
        timestamp,
        previous,
      );
      await this.books.save(book);
      return book;
    } catch (error) {
      if (!previous) {
        await this.files.removeBook(managedFile).catch(() => undefined);
      }
      throw error;
    }
  }

  async ensureMetadata(book: LibraryBookRecord): Promise<LibraryBookRecord> {
    if (book.metadataVersion >= CURRENT_BOOK_METADATA_VERSION) {
      return book;
    }

    const managedFile = toManagedBookFile(book);
    const inspection = this.inspectEpub(await this.files.readBook(managedFile));
    const coverUri = inspection.cover
      ? await this.files.saveCover(managedFile, inspection.cover)
      : book.coverUri;
    const updated: LibraryBookRecord = {
      ...book,
      publisher: inspection.metadata.publisher ?? book.publisher,
      description: inspection.metadata.description ?? book.description,
      coverUri,
      metadataVersion: CURRENT_BOOK_METADATA_VERSION,
      updatedAt: this.now(),
    };
    await this.books.save(updated);
    return updated;
  }
}

function toLibraryBook(
  file: ManagedBookFile,
  inspection: ReaderBookInspection,
  coverUri: string | undefined,
  timestamp: number,
  previous?: LibraryBookRecord,
): LibraryBookRecord {
  const { metadata } = inspection;
  return {
    id: previous?.id ?? file.bookId,
    title: metadata.title,
    author: metadata.creator,
    language: metadata.language,
    epubIdentifier: metadata.identifier,
    publisher: metadata.publisher,
    description: metadata.description,
    fileUri: file.uri,
    fileName: file.fileName,
    fileSize: file.fileSize,
    sha256: file.sha256,
    coverUri,
    metadataVersion: CURRENT_BOOK_METADATA_VERSION,
    addedAt: previous?.addedAt ?? timestamp,
    lastOpenedAt: previous?.lastOpenedAt,
    updatedAt: timestamp,
  };
}

function toManagedBookFile(book: LibraryBookRecord): ManagedBookFile {
  return {
    bookId: book.id,
    uri: book.fileUri,
    fileName: book.fileName,
    fileSize: book.fileSize,
    sha256: book.sha256,
  };
}
