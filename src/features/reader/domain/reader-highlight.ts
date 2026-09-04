import type { ReaderSourceRange } from '@/reader';

export interface ReaderHighlight {
  readonly id: string;
  readonly bookId: string;
  readonly href: string;
  readonly sourceRange: ReaderSourceRange;
  readonly text: string;
  readonly createdAt: number;
}
