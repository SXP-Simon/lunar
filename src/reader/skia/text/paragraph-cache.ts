import type { SkParagraph } from '@shopify/react-native-skia';

export interface CachedReaderParagraph {
  readonly paragraph: SkParagraph;
  readonly baseline: number;
}

/** Bounded, session-owned shaped text, shared by neighboring page recordings. */
export class ReaderParagraphCache {
  private readonly entries = new Map<string, CachedReaderParagraph>();
  private keyLength = 0;

  constructor(
    private readonly maximumEntries = 1024,
    private readonly maximumKeyLength = 256 * 1024,
  ) {
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1
      || !Number.isSafeInteger(maximumKeyLength) || maximumKeyLength < 1) {
      throw new RangeError('Paragraph cache limits must be positive integers.');
    }
  }

  getOrCreate(key: string, create: () => CachedReaderParagraph): CachedReaderParagraph {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    const entry = create();
    this.entries.set(key, entry);
    this.keyLength += key.length;
    // Keep one oversized run until the caller has painted it. SkPicture owns
    // its recorded text, so retiring a paragraph cannot invalidate old pages.
    while (this.entries.size > 1 && (this.entries.size > this.maximumEntries
      || this.keyLength > this.maximumKeyLength)) {
      const oldestKey = this.entries.keys().next().value!;
      const oldest = this.entries.get(oldestKey)!;
      this.entries.delete(oldestKey);
      this.keyLength -= oldestKey.length;
      oldest.paragraph.dispose();
    }
    return entry;
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.paragraph.dispose();
    this.entries.clear();
    this.keyLength = 0;
  }
}
