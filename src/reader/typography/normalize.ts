import type { ReaderTypography } from '../contracts';

export function normalizeReaderTypography(
  typography: ReaderTypography,
): ReaderTypography {
  const fontFamily = typography.fontFamily?.trim();
  return {
    ...(fontFamily ? { fontFamily } : {}),
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
