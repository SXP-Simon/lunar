import '@/global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useUniwind } from 'uniwind';

import { AppProviders } from '@/components/providers/app-providers';
import AppTabs from '@/components/ui/app-tabs';

export default function TabLayout() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  return (
    <AppProviders>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AppTabs />
      </ThemeProvider>
    </AppProviders>
  );
}
