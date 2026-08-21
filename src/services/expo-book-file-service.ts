import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { BookFileService, ManagedBookFile } from './book-file-service';

const EPUB_FILE_NAME = 'book.epub';
const MAX_EPUB_ARCHIVE_BYTES = 100 * 1024 * 1024;

export class ExpoBookFileService implements BookFileService {
  async importEpub(sourceUri: string, fileName: string): Promise<ManagedBookFile> {
    assertEpubFileName(fileName);

    const source = new File(sourceUri);
    if (!source.exists) {
      throw new Error('The selected EPUB file cannot be read.');
    }

    const data = await source.arrayBuffer();
    const fileSize = data.byteLength;
    if (fileSize > MAX_EPUB_ARCHIVE_BYTES) {
      throw new RangeError(
        `The selected EPUB exceeds the ${MAX_EPUB_ARCHIVE_BYTES} byte limit.`,
      );
    }

    const sha256 = bytesToHex(
      await digest(CryptoDigestAlgorithm.SHA256, data),
    );
    const bookId = sha256;
    const booksDirectory = new Directory(Paths.document, 'books');
    booksDirectory.create({ intermediates: true, idempotent: true });
    const bookDirectory = new Directory(booksDirectory, bookId);
    bookDirectory.create({ intermediates: true, idempotent: true });
    const target = new File(bookDirectory, EPUB_FILE_NAME);

    if (!target.exists) {
      await source.copy(target);
    }

    return {
      bookId,
      uri: target.uri,
      fileName,
      fileSize,
      sha256,
    };
  }

  async readBook(book: ManagedBookFile): Promise<ArrayBuffer> {
    const file = new File(book.uri);
    if (!file.exists) {
      throw new Error(`Managed EPUB is missing for book ${book.bookId}.`);
    }
    return file.arrayBuffer();
  }

  async removeBook(book: ManagedBookFile): Promise<void> {
    const directory = new File(book.uri).parentDirectory;
    if (directory.exists) {
      directory.delete();
    }
  }
}

function assertEpubFileName(fileName: string): void {
  if (!fileName.toLocaleLowerCase().endsWith('.epub')) {
    throw new TypeError('Only EPUB files can be imported.');
  }
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
