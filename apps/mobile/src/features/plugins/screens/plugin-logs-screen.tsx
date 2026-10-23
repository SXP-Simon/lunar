import { useLocalSearchParams, type Href } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMarkInitialContentReady } from '@/hooks/use-mark-initial-content-ready';
import { useTranslation } from '@/i18n';
import type { PluginLogEntry } from '../domain/installed-plugin';
import { usePluginRuntime } from '../components/plugin-runtime-provider';
import { PluginScreenHeader } from '../components/plugin-screen-header';

const LevelClass: Record<PluginLogEntry['level'], string> = {
  error: 'text-danger',
  warn: 'text-foreground',
  info: 'text-muted',
};

export function PluginLogsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  useMarkInitialContentReady(true);
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  const host = usePluginRuntime().host;
  useSyncExternalStore(host.subscribeLogs, host.getLogVersion);
  useSyncExternalStore(host.subscribe, host.getVersion);
  // The host keeps a bounded buffer in place; copy it so the list sees each change.
  const logs = [...host.getLogs(pluginId)].reverse();

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <PluginScreenHeader
        title={t('plugins.logs')}
        fallback={{ pathname: '/plugins/[pluginId]', params: { pluginId } } as unknown as Href}
      />
      <FlatList
        data={logs}
        keyExtractor={(entry, index) => `${entry.at}:${index}`}
        contentContainerClassName="grow px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        ListEmptyComponent={
          <View className="grow items-center justify-center pb-16">
            <Text className="text-sm text-muted">{t('plugins.noLogs')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="w-full max-w-[800px] gap-0.5 self-center border-b border-border py-3">
            <Text className="text-xs text-muted">
              {`${new Date(item.at).toLocaleTimeString()} · ${item.level.toUpperCase()}`}
            </Text>
            <Text selectable className={`text-sm leading-5 ${LevelClass[item.level]}`}>
              {item.message}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
