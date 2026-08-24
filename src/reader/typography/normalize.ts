import type { ReaderTypography } from '../contracts';
import { LUNAR_READER_FONT_FAMILY } from './builtin-font';

export function normalizeReaderTypography(
  typography: ReaderTypography,
): ReaderTypography {
  return {
    fontFamily: LUNAR_READER_FONT_FAMILY,
    fontSize: requirePositiveFinite(typography.fontSize, 'fontSize'),
    lineHeight: requirePositiveFinite(typography.lineHeight, 'lineHeight'),
    marginHorizontal: requireNonNegativeFinite(
      typography.marginHorizontal,
      'marginHorizontal',
    ),
    marginVertical: requireNonNegativeFinite(
      typography.marginVertical,
      'marginVertical',
    ),
    spreadMode: typography.spreadMode,
  };
}

function requirePositiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Reader typography ${name} must be a positive finite number.`);
  }
  return value;
}

function requireNonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `Reader typography ${name} must be a non-negative finite number.`,
    );
  }
  return value;
}
