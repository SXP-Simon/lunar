import { Button } from 'heroui-native/button';
import { Spinner } from 'heroui-native/spinner';
import { createElement, useEffect, useMemo, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { PluginScopeContext, type PluginScopeValue } from '../runtime/plugin-scope';
import type { PluginHost } from '../services/plugin-host';
import { PluginErrorBoundary } from './plugin-error-boundary';

interface PluginSlotViewProps {
  readonly host: PluginHost;
  readonly pluginId: string;
  /** `${slot}:${id}` or `route:${pageId}`. */
  readonly componentKey: string;
  readonly componentProps: object;
  /** Overlays render nothing while unavailable instead of a status message. */
  readonly quiet?: boolean;
}

/** Activates the owning plugin on demand and renders its component inside an error boundary. */
export function PluginSlotView({ host, pluginId, componentKey, componentProps, quiet = false }: PluginSlotViewProps) {
  const { t } = useTranslation();
  useSyncExternalStore(host.subscribe, host.getVersion, host.getVersion);
  const entry = host.getEntry(pluginId);
  const enabled = entry?.enabled === true;
  const generation = entry?.generation;
  const context = generation?.context;
  const Component = host.getComponent<object>(pluginId, componentKey);
  const scope = useMemo<PluginScopeValue | undefined>(
    () => (context ? { host, pluginId, context } : undefined),
    [context, host, pluginId],
  );

  useEffect(() => {
    if (enabled) void host.ensureActive(pluginId);
  }, [enabled, host, pluginId]);

  if (!entry || !enabled) return null;
  if (!scope || !Component || !generation) {
    if (quiet) return null;
    if (entry.state === 'activating' || entry.state === 'idle') {
      return (
        <View className="items-center py-8">
          <Spinner />
        </View>
      );
    }
    return (
      <SlotMessage
        message={entry.state === 'failed' ? t('plugins.slotFailed') : t('plugins.slotUnavailable')}
        actionLabel={entry.state === 'failed' ? t('plugins.retry') : undefined}
        onAction={() => void host.ensureActive(pluginId)}
      />
    );
  }

  return (
    <PluginScopeContext.Provider value={scope}>
      <PluginErrorBoundary
        resetKey={generation.number}
        onError={(error) => host.reportCrash(pluginId, error, componentKey)}
        fallback={(retry) =>
          quiet ? null : (
            <SlotMessage message={t('plugins.slotCrashed')} actionLabel={t('plugins.retry')} onAction={retry} />
          )
        }>
        {/* Plugin components are registered at run time, not declared in this module. */}
        {createElement(Component, componentProps)}
      </PluginErrorBoundary>
    </PluginScopeContext.Provider>
  );
}

function SlotMessage({
  message,
  actionLabel,
  onAction,
}: {
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction: () => void;
}) {
  return (
    <View className="items-center gap-3 px-4 py-8">
      <Text className="text-center text-sm text-muted">{message}</Text>
      {actionLabel ? (
        <Button size="sm" variant="secondary" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
