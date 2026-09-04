import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useLayoutEffect } from 'react';
import { Uniwind, useUniwind } from 'uniwind';

import { AppProviders } from '@/components/providers/app-providers';
import { useApplicationSettingsStore } from '@/stores';

export default function RootLayout() {
  const { theme } = useUniwind();
  const themeMode = useApplicationSettingsStore((state) => state.themeMode);
  const isDark = theme === 'dark';

  useLayoutEffect(() => {
    Uniwind.setTheme(themeMode);
  }, [themeMode]);

  return (
    <AppProviders>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <NavigationBar hidden={false} style={isDark ? 'dark' : 'light'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="reader/[bookId]" />
        </Stack>
      </ThemeProvider>
    </AppProviders>
  );
}
