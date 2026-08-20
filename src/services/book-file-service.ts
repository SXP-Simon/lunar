export interface ManagedBookFile {
  readonly bookId: string;
  readonly uri: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly sha256: string;
}

export interface BookFileService {
  importEpub(sourceUri: string, fileName: string): Promise<ManagedBookFile>;
  readBook(book: ManagedBookFile): Promise<ArrayBuffer>;
  removeBook(book: ManagedBookFile): Promise<void>;
}
