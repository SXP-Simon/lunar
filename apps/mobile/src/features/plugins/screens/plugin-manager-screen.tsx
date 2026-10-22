import { useRouter, type Href } from 'expo-router';
import { Button } from 'heroui-native/button';
import { ControlField } from 'heroui-native/control-field';
import { Description } from 'heroui-native/description';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { ListGroup } from 'heroui-native/list-group';
import { Separator } from 'heroui-native/separator';
import { Switch } from 'heroui-native/switch';
import { useToast } from 'heroui-native/toast';
import { Fragment, useState, useSyncExternalStore } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMarkInitialContentReady } from '@/hooks/use-mark-initial-content-ready';
import { useTranslation } from '@/i18n';
import { usePluginStore } from '@/stores';
import type { PluginStatus } from '../domain/installed-plugin';
import { pluginErrorMessage } from '../domain/plugin-error';
import { pickPluginPackage } from '../infrastructure/expo-plugin-files';
import type { PluginInstallPreview } from '../services/plugin-installer';
import { PluginInstallDialog } from '../components/plugin-install-dialog';
import { usePluginRuntime } from '../components/plugin-runtime-provider';
import { PluginScreenHeader } from '../components/plugin-screen-header';

export function PluginManagerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  useMarkInitialContentReady(true);
  const runtime = usePluginRuntime();
  const statuses = useSyncExternalStore(runtime.host.subscribe, runtime.host.getStatuses);
  const devStatus = useSyncExternalStore(runtime.subscribeDevStatus, runtime.getDevStatus);
  const developerMode = usePluginStore((state) => state.developerMode);
  const setDeveloperMode = usePluginStore((state) => state.setDeveloperMode);
  const setEnabled = usePluginStore((state) => state.setEnabled);
  const setSafeModeRequested = usePluginStore((state) => state.setSafeModeRequested);
  const [safeMode, setSafeMode] = useState(runtime.isSafeMode());
  const [preview, setPreview] = useState<PluginInstallPreview>();
  const [isInstalling, setIsInstalling] = useState(false);
  const [devUrl, setDevUrl] = useState(devStatus?.url ?? '');

  const fail = (error: unknown) => toast.show({ variant: 'danger', label: pluginErrorMessage(error) });

  const pickPackage = async () => {
    try {
      const picked = await pickPluginPackage();
      if (picked) setPreview(await runtime.inspectPackage(picked.bytes));
    } catch (error) {
      fail(error);
    }
  };

  const install = async () => {
    if (!preview) return;
    setIsInstalling(true);
    try {
      const result = await runtime.installPackage(preview, true);
      toast.show({
        variant: 'success',
        label: t(result === 'pending' ? 'plugins.installedAfterRestart' : 'plugins.installed'),
      });
      setPreview(undefined);
    } catch (error) {
      fail(error);
    } finally {
      setIsInstalling(false);
    }
  };

  const connect = () => {
    try {
      runtime.connectDevServer(devUrl);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <PluginScreenHeader title={t('plugins.title')} fallback={'/(tabs)/settings' as Href} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow px-4 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View className="w-full max-w-[800px] gap-8 self-center">
          {safeMode ? (
            <View className="gap-3 rounded-3xl bg-surface p-5">
              <Text className="text-base font-semibold text-foreground">{t('plugins.safeModeTitle')}</Text>
              <Text className="text-sm leading-5 text-muted">{t('plugins.safeModeBody')}</Text>
              <Button
                variant="secondary"
                onPress={() => {
                  runtime.exitSafeMode();
                  setSafeMode(false);
                }}>
                {t('plugins.exitSafeMode')}
              </Button>
            </View>
          ) : null}

          <View>
            <Text className="mb-2 ml-3 text-sm font-medium text-muted">{t('plugins.installedSection')}</Text>
            <ListGroup className="overflow-hidden rounded-3xl bg-surface">
              {statuses.length === 0 ? (
                <View className="px-5 py-6">
                  <Text className="text-sm text-muted">{t('plugins.empty')}</Text>
                </View>
              ) : (
                statuses.map((status, index) => (
                  <Fragment key={status.plugin.id}>
                    {index > 0 ? <Separator className="mx-5" /> : null}
                    <PluginRow
                      status={status}
                      title={runtime.host.localize(status.plugin.id, status.plugin.manifest.name)}
                      safeMode={safeMode}
                      onToggle={(enabled) => setEnabled(status.plugin.id, enabled)}
                      onPress={() =>
                        router.push({
                          pathname: '/settings/plugins/[pluginId]',
                          params: { pluginId: status.plugin.id },
                        } as unknown as Href)
                      }
                    />
                  </Fragment>
                ))
              )}
            </ListGroup>
          </View>

          <View className="gap-3">
            <Button variant="primary" isDisabled={!developerMode} onPress={() => void pickPackage()}>
              {t('plugins.installFromFile')}
            </Button>
            <Text className="px-3 text-xs leading-4 text-muted">
              {t(developerMode ? 'plugins.installFromFileHint' : 'plugins.installNeedsDeveloperMode')}
            </Text>
          </View>

          <View>
            <Text className="mb-2 ml-3 text-sm font-medium text-muted">{t('plugins.developerSection')}</Text>
            <ListGroup className="overflow-hidden rounded-3xl bg-surface">
              <ControlField
                accessibilityLabel={t('plugins.developerMode')}
                accessibilityRole="switch"
                accessibilityState={{ checked: developerMode }}
                className="min-h-[72px] px-5 py-4 active:bg-surface-secondary"
                isSelected={developerMode}
                onSelectedChange={(enabled) => {
                  setDeveloperMode(enabled);
                  if (!enabled) runtime.disconnectDevServer();
                }}>
                <View className="flex-1 pr-4">
                  <Label className="text-base font-medium text-foreground">{t('plugins.developerMode')}</Label>
                  <Description className="mt-0.5 text-sm leading-5 text-muted">
                    {t('plugins.developerModeDescription')}
                  </Description>
                </View>
                <ControlField.Indicator>
                  <Switch className="h-7 w-12" accessibilityElementsHidden>
                    <Switch.Thumb className="size-5" />
                  </Switch>
                </ControlField.Indicator>
              </ControlField>
              {developerMode ? (
                <View className="gap-3 px-5 pb-5">
                  <Separator />
                  <Label>{t('plugins.devServer')}</Label>
                  <Input
                    value={devUrl}
                    onChangeText={setDevUrl}
                    placeholder="http://192.168.1.2:5757/?token=…"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    accessibilityLabel={t('plugins.devServer')}
                  />
                  {devStatus ? (
                    <Text className={`text-sm ${devStatus.state === 'error' ? 'text-danger' : 'text-muted'}`}>
                      {devStatus.state === 'error'
                        ? devStatus.error
                        : devStatus.state === 'connected'
                          ? t('plugins.devConnected', {
                              id: devStatus.pluginId ?? '',
                              revision: String(devStatus.revision ?? 0),
                            })
                          : t('plugins.devConnecting')}
                    </Text>
                  ) : null}
                  <View className="flex-row gap-3">
                    <Button className="flex-1" variant="primary" isDisabled={!devUrl.trim()} onPress={connect}>
                      {t(devStatus ? 'plugins.devReconnect' : 'plugins.devConnect')}
                    </Button>
                    {devStatus ? (
                      <Button className="flex-1" variant="tertiary" onPress={() => runtime.disconnectDevServer()}>
                        {t('plugins.devDisconnect')}
                      </Button>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </ListGroup>
          </View>

          <View className="gap-2">
            <Button
              variant="tertiary"
              onPress={() => {
                setSafeModeRequested(true);
                toast.show({ variant: 'default', label: t('plugins.safeModeScheduled') });
              }}>
              {t('plugins.requestSafeMode')}
            </Button>
          </View>
        </View>
      </ScrollView>

      <PluginInstallDialog
        preview={preview}
        isInstalling={isInstalling}
        onConfirm={() => void install()}
        onCancel={() => setPreview(undefined)}
      />
    </View>
  );
}

function PluginRow({
  status,
  title,
  safeMode,
  onToggle,
  onPress,
}: {
  readonly status: PluginStatus;
  readonly title: string;
  readonly safeMode: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  const development = status.plugin.source === 'development';
  const detail = [
    status.plugin.version,
    t(`plugins.source.${status.plugin.source}`),
    status.pendingVersion ? t('plugins.pendingVersion', { version: status.pendingVersion }) : undefined,
    status.state === 'failed' ? t('plugins.failed') : undefined,
    status.notice ? t('plugins.restoredVersion', { version: status.notice.restoredVersion }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-row items-center">
      <ListGroup.Item
        accessibilityRole="button"
        accessibilityLabel={title}
        className="min-h-[72px] flex-1 px-5 py-4 active:bg-surface-secondary"
        onPress={onPress}>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle className="text-base font-medium text-foreground">{title}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription
            className={`mt-0.5 text-sm ${status.state === 'failed' || status.notice ? 'text-danger' : 'text-muted'}`}>
            {detail}
          </ListGroup.ItemDescription>
        </ListGroup.ItemContent>
      </ListGroup.Item>
      {development ? null : (
        <View className="pr-5">
          <ControlField
            accessibilityLabel={t('plugins.enable', { name: title })}
            accessibilityRole="switch"
            accessibilityState={{ checked: status.enabled, disabled: safeMode }}
            isDisabled={safeMode}
            isSelected={status.enabled}
            onSelectedChange={onToggle}>
            <ControlField.Indicator>
              <Switch className="h-7 w-12" accessibilityElementsHidden>
                <Switch.Thumb className="size-5" />
              </Switch>
            </ControlField.Indicator>
          </ControlField>
        </View>
      )}
    </View>
  );
}
