import type { ReaderTypography } from '../contracts';
import { normalizeReaderTypography } from './normalize';

export function createReaderTypographyKey(typography: ReaderTypography): string {
  const normalized = normalizeReaderTypography(typography);
  return JSON.stringify([
    normalized.fontFamily ?? '',
    normalized.fontSize,
    normalized.lineHeight,
    normalized.marginHorizontal,
    normalized.marginVertical,
    normalized.spreadMode,
  ]);
}
