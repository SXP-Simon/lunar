import type { ReaderTypography } from '../contracts';
import { LUNAR_READER_FONT_FAMILY } from './builtin-font';

export const DEFAULT_READER_TYPOGRAPHY: Readonly<ReaderTypography> = {
  fontFamily: LUNAR_READER_FONT_FAMILY,
  fontSize: 18,
  lineHeight: 1.65,
  marginHorizontal: 24,
  marginVertical: 36,
  spreadMode: 'single',
};
