import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Button } from 'heroui-native/button';
import { ControlField } from 'heroui-native/control-field';
import { Label } from 'heroui-native/label';
import { Switch } from 'heroui-native/switch';
import { useToast } from 'heroui-native/toast';
import { useState, useSyncExternalStore } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useMarkInitialContentReady } from '@/hooks/use-mark-initial-content-ready';
import { useTranslation } from '@/i18n';
import { usePluginStore } from '@/stores';
import { pluginErrorMessage } from '../domain/plugin-error';
import { permissionLabel } from '../components/plugin-install-dialog';
import { usePluginRuntime } from '../components/plugin-runtime-provider';
import { PluginScreenHeader } from '../components/plugin-screen-header';
import { PluginSettingsForm } from '../components/plugin-settings-form';
import { PluginSlotView } from '../components/plugin-slot-view';

const VisibleLogEntries = 50;

export function PluginDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  useMarkInitialContentReady(true);
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  const runtime = usePluginRuntime();
  const host = runtime.host;
  const statuses = useSyncExternalStore(host.subscribe, host.getStatuses);
  const status = statuses.find((item) => item.plugin.id === pluginId);
  const setEnabled = usePluginStore((state) => state.setEnabled);
  const [keepData, setKeepData] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  if (!status) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <PluginScreenHeader title={t('plugins.title')} fallback={'/settings/plugins' as Href} />
        <Text className="px-5 text-sm text-muted">{t('plugins.notFound')}</Text>
      </View>
    );
  }

  const { plugin } = status;
  const manifest = plugin.manifest;
  const text = (value: string) => host.localize(plugin.id, value);
  const development = plugin.source === 'development';
  const hasCustomSettings = manifest.contributes.slots['settings.plugin'].length > 0;
  const logs = host.getLogs(plugin.id).slice(-VisibleLogEntries).reverse();

  const uninstall = async () => {
    setIsUninstalling(true);
    try {
      await runtime.uninstall(plugin.id, keepData);
      setConfirmUninstall(false);
      if (router.canGoBack()) router.back();
      else router.replace('/settings/plugins' as Href);
    } catch (error) {
      toast.show({ variant: 'danger', label: pluginErrorMessage(error) });
    } finally {
      setIsUninstalling(false);
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <PluginScreenHeader title={text(manifest.name)} fallback={'/settings/plugins' as Href} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow px-4 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View className="w-full max-w-[800px] gap-6 self-center">
          <View className="gap-2 rounded-3xl bg-surface p-5">
            {manifest.description ? (
              <Text className="text-base leading-6 text-foreground">{text(manifest.description)}</Text>
            ) : null}
            <Text className="text-sm leading-5 text-muted">
              {[plugin.id, plugin.version, manifest.author, t(`plugins.source.${plugin.source}`)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text className="text-sm text-muted">
              {t(`plugins.state.${status.state}`)}
              {status.activationMs !== undefined
                ? ` · ${t('plugins.activationTime', { ms: String(status.activationMs) })}`
                : ''}
            </Text>
            {status.error ? <Text className="text-sm text-danger">{status.error}</Text> : null}
            {status.notice ? (
              <Text className="text-sm text-danger">
                {t('plugins.reverted', {
                  failed: status.notice.failedVersion,
                  restored: status.notice.restoredVersion,
                  reason: status.notice.reason,
                })}
              </Text>
            ) : null}
            {status.pendingVersion ? (
              <Text className="text-sm text-muted">
                {t('plugins.pendingVersion', { version: status.pendingVersion })}
              </Text>
            ) : null}
          </View>

          {development ? null : (
            <View className="overflow-hidden rounded-3xl bg-surface">
              <ControlField
                accessibilityLabel={t('plugins.enable', { name: text(manifest.name) })}
                accessibilityRole="switch"
                accessibilityState={{ checked: status.enabled }}
                className="min-h-[64px] px-5 py-4 active:bg-surface-secondary"
                isDisabled={runtime.isSafeMode()}
                isSelected={status.enabled}
                onSelectedChange={(enabled) => setEnabled(plugin.id, enabled)}>
                <View className="flex-1 pr-4">
                  <Label className="text-base font-medium text-foreground">{t('plugins.enabled')}</Label>
                </View>
                <ControlField.Indicator>
                  <Switch className="h-7 w-12" accessibilityElementsHidden>
                    <Switch.Thumb className="size-5" />
                  </Switch>
                </ControlField.Indicator>
              </ControlField>
            </View>
          )}

          <View className="gap-2">
            <Text className="ml-3 text-sm font-medium text-muted">{t('plugins.permissions')}</Text>
            <View className="gap-3 rounded-3xl bg-surface p-5">
              <Text className="text-sm leading-5 text-muted">{t('plugins.trustBody')}</Text>
              {manifest.permissions.length === 0 ? (
                <Text className="text-sm text-muted">{t('plugins.noPermissions')}</Text>
              ) : (
                manifest.permissions.map((permission) => (
                  <View key={permission.name} className="gap-0.5">
                    <Text className="text-sm font-medium text-foreground">{permissionLabel(permission.name, t)}</Text>
                    <Text className="text-xs leading-4 text-muted">{text(permission.reason)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          {manifest.contributes.settings.length > 0 || hasCustomSettings ? (
            <View className="gap-2">
              <Text className="ml-3 text-sm font-medium text-muted">{t('plugins.settings')}</Text>
              <View className="gap-4 rounded-3xl bg-surface p-5">
                <PluginSettingsForm host={host} plugin={plugin} />
                {hasCustomSettings && status.enabled ? (
                  <PluginSlotView
                    host={host}
                    pluginId={plugin.id}
                    componentKey={`settings.plugin:${manifest.contributes.slots['settings.plugin'][0].id}`}
                    componentProps={{ slotId: manifest.contributes.slots['settings.plugin'][0].id }}
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          <View className="gap-2">
            <Button variant="tertiary" onPress={() => setShowLogs((value) => !value)}>
              {t(showLogs ? 'plugins.hideLogs' : 'plugins.showLogs', { count: String(logs.length) })}
            </Button>
            {showLogs ? (
              <View className="gap-1 rounded-3xl bg-surface p-5">
                {logs.length === 0 ? <Text className="text-sm text-muted">{t('plugins.noLogs')}</Text> : null}
                {logs.map((entry, index) => (
                  <Text
                    key={`${entry.at}:${index}`}
                    selectable
                    className={`text-xs leading-4 ${entry.level === 'error' ? 'text-danger' : entry.level === 'warn' ? 'text-foreground' : 'text-muted'}`}>
                    {`${new Date(entry.at).toLocaleTimeString()} ${entry.level.toUpperCase()} ${entry.message}`}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          {development ? null : (
            <View className="gap-3">
              <ControlField
                accessibilityLabel={t('plugins.keepData')}
                accessibilityRole="switch"
                accessibilityState={{ checked: keepData }}
                className="px-3"
                isSelected={keepData}
                onSelectedChange={setKeepData}>
                <View className="flex-1 pr-4">
                  <Label className="text-sm text-foreground">{t('plugins.keepData')}</Label>
                </View>
                <ControlField.Indicator>
                  <Switch className="h-7 w-12" accessibilityElementsHidden>
                    <Switch.Thumb className="size-5" />
                  </Switch>
                </ControlField.Indicator>
              </ControlField>
              <Button variant="danger" onPress={() => setConfirmUninstall(true)}>
                {t('plugins.uninstall')}
              </Button>
            </View>
          )}
        </View>
      </ScrollView>

      <ConfirmModal
        isOpen={confirmUninstall}
        title={t('plugins.uninstallTitle', { name: text(manifest.name) })}
        description={t(keepData ? 'plugins.uninstallKeepData' : 'plugins.uninstallDeleteData')}
        confirmLabel={t('plugins.uninstall')}
        isDestructive
        isConfirming={isUninstalling}
        onConfirm={() => void uninstall()}
        onOpenChange={setConfirmUninstall}
      />
    </View>
  );
}
