import {
  ReaderPublicationLoader,
  type LoadedReaderPublication,
  type LoadReaderPublicationOptions,
  type ReaderImageDimensions,
} from '../../../reader';
import type { BookFileService, LibraryBookRecord } from '../../library';

export type LoadManagedPublicationOptions<
  TImage extends ReaderImageDimensions = ReaderImageDimensions,
> = Omit<LoadReaderPublicationOptions<TImage>, 'data'>;

export class ReaderPublicationService {
  constructor(
    private readonly files: BookFileService,
    private readonly loader = new ReaderPublicationLoader(),
  ) {}

  async load<TImage extends ReaderImageDimensions>(
    book: LibraryBookRecord,
    options: LoadManagedPublicationOptions<TImage>,
  ): Promise<LoadedReaderPublication> {
    const data = await this.files.readBook({
      bookId: book.id,
      uri: book.fileUri,
      fileName: book.fileName,
      fileSize: book.fileSize,
      sha256: book.sha256,
    });
    return this.loader.load({ ...options, data });
  }
}
