import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useUniwind } from 'uniwind';

import { AppProviders } from '@/components/providers/app-providers';
export default function RootLayout() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  return (
    <AppProviders>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="reader/[bookId]" />
        </Stack>
      </ThemeProvider>
    </AppProviders>
  );
}
