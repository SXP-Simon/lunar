import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { ControlField } from 'heroui-native/control-field';
import { useThemeColor } from 'heroui-native/hooks';
import { Menu } from 'heroui-native/menu';
import { Spinner } from 'heroui-native/spinner';
import { Switch } from 'heroui-native/switch';
import { useToast } from 'heroui-native/toast';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_TAB_BAR_HEIGHT } from '@/components/ui/app-tabs';
import { useMarkInitialContentReady } from '@/hooks/use-mark-initial-content-ready';
import { useTranslation } from '@/i18n';
import { usePluginStore } from '@/stores';
import type { PluginStatus } from '../domain/installed-plugin';
import { pluginErrorMessage } from '../domain/plugin-error';
import { pluginSymbolName } from '../domain/plugin-icons';
import { pickPluginPackage } from '../infrastructure/expo-plugin-files';
import { takeExternalPluginPackage } from '../services/external-plugin-install';
import type { PluginInstallPreview } from '../services/plugin-installer';
import { PluginInstallDialog } from '../components/plugin-install-dialog';
import { usePluginRuntime } from '../components/plugin-runtime-provider';

const PLUGIN_SETTINGS_ROUTE = '/settings/plugins' as Href;

export function PluginManagerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { install: installRequest } = useLocalSearchParams<{ install?: string }>();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  useMarkInitialContentReady(true);
  const runtime = usePluginRuntime();
  const statuses = useSyncExternalStore(runtime.host.subscribe, runtime.host.getStatuses);
  const developerMode = usePluginStore((state) => state.developerMode);
  const setEnabled = usePluginStore((state) => state.setEnabled);
  const setSafeModeRequested = usePluginStore((state) => state.setSafeModeRequested);
  const [safeMode, setSafeMode] = useState(runtime.isSafeMode());
  const [preview, setPreview] = useState<PluginInstallPreview>();
  const [isPicking, setIsPicking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const iconColor = useThemeColor('foreground');

  const fail = (error: unknown) => toast.show({ variant: 'danger', label: pluginErrorMessage(error) });

  const pickPackage = async () => {
    if (!developerMode) {
      toast.show({ variant: 'default', label: t('plugins.installNeedsDeveloperMode') });
      return;
    }
    setIsPicking(true);
    try {
      const picked = await pickPluginPackage();
      if (picked) setPreview(await runtime.inspectPackage(picked.bytes));
    } catch (error) {
      fail(error);
    } finally {
      setIsPicking(false);
    }
  };

  // Packages opened from a file manager or another app arrive as `?install=<requestId>`.
  useEffect(() => {
    if (!installRequest) return;
    router.setParams({ install: undefined });
    const opened = takeExternalPluginPackage(installRequest);
    if (!opened) return;
    if (!developerMode) {
      toast.show({ variant: 'default', label: t('plugins.installNeedsDeveloperMode') });
      return;
    }
    void opened
      .then((picked) => runtime.inspectPackage(picked.bytes))
      .then(setPreview)
      .catch((error: unknown) => toast.show({ variant: 'danger', label: pluginErrorMessage(error) }));
  }, [developerMode, installRequest, router, runtime, t, toast]);

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

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View className="w-full max-w-[800px] flex-row items-center gap-2 self-center px-4 pt-1 pb-2">
        <Text accessibilityRole="header" className="min-w-0 flex-1 px-1 text-2xl font-semibold text-foreground">
          {t('plugins.title')}
        </Text>
        <Button
          accessibilityLabel={t('plugins.installFromFile')}
          className="h-9 rounded-full"
          hitSlop={4}
          isDisabled={isPicking}
          isIconOnly
          onPress={() => void pickPackage()}
          size="sm"
          variant="secondary">
          {isPicking ? (
            <Spinner color={iconColor} size="sm" />
          ) : (
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={19} tintColor={iconColor} />
          )}
        </Button>
        <Menu>
          <Menu.Trigger asChild>
            <Button
              accessibilityLabel={t('plugins.moreActions')}
              className="h-9 rounded-full"
              hitSlop={4}
              isIconOnly
              size="sm"
              variant="secondary">
              <SymbolView
                name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }}
                size={19}
                tintColor={iconColor}
              />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Overlay />
            <Menu.Content align="end" placement="bottom" presentation="popover" width={240}>
              <Menu.Item onPress={() => router.push(PLUGIN_SETTINGS_ROUTE)}>
                <Menu.ItemTitle>{t('plugins.settingsTitle')}</Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item
                onPress={() => {
                  setSafeModeRequested(true);
                  toast.show({ variant: 'default', label: t('plugins.safeModeScheduled') });
                }}>
                <Menu.ItemTitle>{t('plugins.requestSafeMode')}</Menu.ItemTitle>
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow px-4 pt-2"
        contentContainerStyle={{ paddingBottom: APP_TAB_BAR_HEIGHT + insets.bottom + 32 }}>
        <View className="w-full max-w-[800px] grow gap-6 self-center">
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

          {statuses.length === 0 ? (
            <View className="grow items-center justify-center gap-3 px-6 pb-16">
              <View className="size-16 items-center justify-center rounded-3xl border border-border bg-surface">
                <SymbolView name={pluginSymbolName(undefined)} size={30} tintColor={iconColor} />
              </View>
              <Text className="text-base font-semibold text-foreground">{t('plugins.empty')}</Text>
            </View>
          ) : (
            <View className="gap-1">
              {statuses.map((status) => (
                <PluginRow
                  key={status.plugin.id}
                  status={status}
                  title={runtime.host.localize(status.plugin.id, status.plugin.manifest.name)}
                  description={
                    status.plugin.manifest.description
                      ? runtime.host.localize(status.plugin.id, status.plugin.manifest.description)
                      : undefined
                  }
                  iconColor={iconColor}
                  safeMode={safeMode}
                  onToggle={(enabled) => setEnabled(status.plugin.id, enabled)}
                  onPress={() =>
                    router.push({
                      pathname: '/plugins/[pluginId]',
                      params: { pluginId: status.plugin.id },
                    } as unknown as Href)
                  }
                />
              ))}
            </View>
          )}
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
  description,
  iconColor,
  safeMode,
  onToggle,
  onPress,
}: {
  readonly status: PluginStatus;
  readonly title: string;
  readonly description?: string;
  readonly iconColor: string;
  readonly safeMode: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  const development = status.plugin.source === 'development';
  const hasProblem = status.state === 'failed' || status.notice !== undefined;
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={detail}
        className="min-w-0 flex-1 flex-row items-center gap-4 rounded-3xl px-2 py-3 active:bg-surface"
        onPress={onPress}>
        <View className="size-14 items-center justify-center rounded-2xl border border-border bg-surface">
          <SymbolView name={pluginSymbolName(status.plugin.manifest.icon)} size={26} tintColor={iconColor} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {description ? (
            <Text className="text-sm leading-5 text-muted" numberOfLines={2}>
              {description}
            </Text>
          ) : null}
          <Text className={`text-xs leading-4 ${hasProblem ? 'text-danger' : 'text-muted'}`} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </Pressable>
      {development ? null : (
        <View className="pl-2 pr-2">
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
