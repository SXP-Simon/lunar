/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#242621',
    background: '#F7F4ED',
    surface: '#FFFDF8',
    backgroundElement: '#EEEAE0',
    backgroundSelected: '#E5DED0',
    textSecondary: '#74766E',
    accent: '#A85132',
    accentSoft: '#F1DDD2',
    border: '#DED8CB',
    navigationActive: '#007AFF',
    tabBar: 'rgba(255, 253, 248, 0.88)',
  },
  dark: {
    text: '#F2EFE6',
    background: '#151613',
    surface: '#20211D',
    backgroundElement: '#292A25',
    backgroundSelected: '#34352F',
    textSecondary: '#A5A69D',
    accent: '#E08B68',
    accentSoft: '#3D2921',
    border: '#373831',
    navigationActive: '#0A84FF',
    tabBar: 'rgba(28, 29, 26, 0.88)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
