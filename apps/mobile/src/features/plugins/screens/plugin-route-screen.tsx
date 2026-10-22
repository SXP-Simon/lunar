import { useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMarkInitialContentReady } from '@/hooks/use-mark-initial-content-ready';
import { usePluginRuntime } from '../components/plugin-runtime-provider';
import { PluginScreenHeader } from '../components/plugin-screen-header';
import { PluginSlotView } from '../components/plugin-slot-view';

/** Hosts a plugin's full-screen page on the shared `/plugin/[pluginId]/[pageId]` route. */
export function PluginRouteScreen() {
  const insets = useSafeAreaInsets();
  useMarkInitialContentReady(true);
  const { pluginId, pageId, ...rest } = useLocalSearchParams<{ pluginId: string; pageId: string }>();
  const { host } = usePluginRuntime();
  useSyncExternalStore(host.subscribe, host.getVersion);
  const entry = host.getEntry(pluginId);
  const route = entry?.plugin.manifest.contributes.slots['app.route'].find((item) => item.id === pageId);
  const restKey = JSON.stringify(rest);
  const params = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(JSON.parse(restKey) as Record<string, unknown>).filter(
          (item): item is [string, string] => typeof item[1] === 'string',
        ),
      ),
    [restKey],
  );
  const componentProps = useMemo(() => ({ pageId, params }), [pageId, params]);

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <PluginScreenHeader title={route ? host.localize(pluginId, route.title) : ''} fallback={'/library' as Href} />
      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
        {route ? (
          <PluginSlotView
            host={host}
            pluginId={pluginId}
            componentKey={`route:${pageId}`}
            componentProps={componentProps}
          />
        ) : null}
      </View>
    </View>
  );
}
