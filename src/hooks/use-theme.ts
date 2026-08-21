/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useUniwind } from 'uniwind';

export function useTheme() {
  const { theme } = useUniwind();

  return Colors[theme === 'dark' ? 'dark' : 'light'];
}
