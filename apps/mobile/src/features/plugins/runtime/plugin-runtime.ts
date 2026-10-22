import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { strFromU8 } from 'fflate';
import { Platform } from 'react-native';
import { Uniwind } from 'uniwind';

import { getLunarDatabase } from '@/db';
import { i18n } from '@/i18n';
import { usePluginStore } from '@/stores';
import type { InstalledPlugin } from '../domain/installed-plugin';
import { LunarPluginError } from '../domain/plugin-error';
import {
  deletePluginFiles,
  listPluginDirectories,
  readPluginBytes,
  sha256Hex,
  writePluginFiles,
} from '../infrastructure/expo-plugin-files';
import { SQLitePluginRecordRepository, SQLitePluginStorageRepository } from '../repositories/sqlite-plugin-repository';
import type { PluginStorageRepository } from '../repositories/plugin-repository';
import { PluginDevSession, type DevSessionStatus } from '../services/plugin-dev-session';
import { PluginHost, type PluginUiBridge } from '../services/plugin-host';
import { PluginInstaller, type PluginInstallPreview } from '../services/plugin-installer';
import { createPluginNetwork } from '../services/plugin-network';
import { createHostModules } from './host-modules';

export interface PluginRuntime {
  readonly host: PluginHost;
  /** Installs the app's toast, dialog and navigation hosts; returns a disconnect function. */
  connectUi(bridge: PluginUiBridge): () => void;
  /** Plugins stay paused for this launch because the last one crashed during activation or the user asked. */
  isSafeMode(): boolean;
  exitSafeMode(): void;
  start(): Promise<void>;
  reload(): Promise<void>;
  inspectPackage(archive: Uint8Array): Promise<PluginInstallPreview>;
  installPackage(preview: PluginInstallPreview, enable: boolean): Promise<'applied' | 'pending'>;
  uninstall(pluginId: string, keepData: boolean): Promise<void>;
  connectDevServer(url: string): void;
  disconnectDevServer(): void;
  getDevStatus(): DevSessionStatus | undefined;
  subscribeDevStatus(listener: () => void): () => void;
}

let runtime: PluginRuntime | undefined;

export function getPluginRuntime(): PluginRuntime {
  runtime ??= createPluginRuntime();
  return runtime;
}

function createPluginRuntime(): PluginRuntime {
  const store = usePluginStore;
  const initial = store.getState();
  let safeMode = Boolean(initial.activatingPluginId) || initial.safeModeRequested;
  if (safeMode) {
    initial.setActivatingPlugin(undefined);
    initial.setSafeModeRequested(false);
  }

  const disconnected: PluginUiBridge = {
    toast: () => undefined,
    confirm: async () => false,
    openRoute: () => undefined,
  };
  let connectedUi = disconnected;
  const ui: PluginUiBridge = {
    toast: (message, tone) => connectedUi.toast(message, tone),
    confirm: (options) => connectedUi.confirm(options),
    openRoute: (pluginId, pageId, params) => connectedUi.openRoute(pluginId, pageId, params),
  };
  const storage = lazyStorage();
  const recordsPromise = getLunarDatabase().then((database) => new SQLitePluginRecordRepository(database));
  const installer = recordsPromise.then(
    (records) =>
      new PluginInstaller({
        records,
        storage,
        sha256: sha256Hex,
        files: { write: writePluginFiles, remove: deletePluginFiles },
      }),
  );

  const host = new PluginHost({
    modules: createHostModules(),
    readEntry: async (plugin) => {
      if (!plugin.directoryUri || !plugin.entrySha256) {
        throw new LunarPluginError('INTEGRITY_FAILED', 'The plugin has no installed entry');
      }
      const bytes = await readPluginBytes(plugin.directoryUri, 'main.js');
      if ((await sha256Hex(bytes)) !== plugin.entrySha256) {
        throw new LunarPluginError('INTEGRITY_FAILED', 'main.js changed after installation');
      }
      return strFromU8(bytes);
    },
    settings: {
      get: (pluginId, key) => store.getState().settings[pluginId]?.[key],
      set: (pluginId, key, value) => store.getState().setSetting(pluginId, key, value),
      subscribe: (listener) =>
        store.subscribe((state, previous) => {
          if (state.settings !== previous.settings) listener();
        }),
    },
    storage,
    network: createPluginNetwork((url, init) => fetch(url, init)),
    clipboard: (text) => Clipboard.setStringAsync(text).then(() => undefined),
    ui,
    hostInfo: () => ({
      appVersion: Constants.expoConfig?.version ?? '0.0.0',
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'android',
      locale: i18n.language,
      colorScheme: Uniwind.currentTheme === 'dark' ? 'dark' : 'light',
    }),
    markActivation: (pluginId) => store.getState().setActivatingPlugin(pluginId),
    onAutoDisabled: (pluginId, reason) => {
      store.getState().setEnabled(pluginId, false);
      ui.toast(
        `${host.localize(pluginId, host.getEntry(pluginId)?.plugin.manifest.name ?? pluginId)}: ${reason}`,
        'danger',
      );
    },
    schedule: (task) => {
      const idle = (globalThis as { requestIdleCallback?: (task: () => void, options?: { timeout: number }) => void })
        .requestIdleCallback;
      if (idle) idle(task, { timeout: 250 });
      else setTimeout(task, 0);
    },
  });

  let installed: readonly InstalledPlugin[] = [];
  let devPlugin: InstalledPlugin | undefined;
  let devSession: PluginDevSession | undefined;
  let devStatus: DevSessionStatus | undefined;
  const devListeners = new Set<() => void>();
  let started: Promise<void> | undefined;

  const sync = () => {
    const state = store.getState();
    const plugins = devPlugin ? [...installed.filter((plugin) => plugin.id !== devPlugin!.id), devPlugin] : installed;
    host.setPlugins(
      plugins.map((plugin) => ({
        plugin,
        // A live development build runs while connected; installed plugins follow the user's choice.
        enabled: !safeMode && (plugin.source === 'development' || state.enabled[plugin.id] === true),
      })),
      state.order,
    );
  };

  const reload = async () => {
    const records = await recordsPromise;
    installed = await records.list();
    const known = new Set(installed.map((plugin) => plugin.id));
    const files = await installer;
    for (const directory of listPluginDirectories()) {
      if (!known.has(directory)) deletePluginFiles(directory);
    }
    for (const plugin of installed) files.cleanUp(plugin);
    sync();
  };

  const setDevStatus = (status: DevSessionStatus | undefined) => {
    devStatus = status;
    for (const listener of [...devListeners]) listener();
  };

  return {
    host,
    connectUi(bridge) {
      connectedUi = bridge;
      return () => {
        if (connectedUi === bridge) connectedUi = disconnected;
      };
    },
    isSafeMode: () => safeMode,
    exitSafeMode() {
      safeMode = false;
      sync();
    },
    start() {
      started ??= (async () => {
        store.subscribe((state, previous) => {
          if (state.enabled !== previous.enabled || state.order !== previous.order) sync();
        });
        await reload();
      })();
      return started;
    },
    reload,
    async inspectPackage(archive) {
      return (await installer).inspect(archive);
    },
    async installPackage(preview, enable) {
      const plugin = await (await installer).install(preview);
      installed = [...installed.filter((item) => item.id !== plugin.id), plugin];
      if (enable) store.getState().setEnabled(plugin.id, true);
      sync();
      return host.hasPendingVersion(plugin.id) ? 'pending' : 'applied';
    },
    async uninstall(pluginId, keepData) {
      await host.removePlugin(pluginId);
      await (await installer).uninstall(pluginId, keepData);
      installed = installed.filter((plugin) => plugin.id !== pluginId);
      store.getState().removePlugin(pluginId);
      sync();
    },
    connectDevServer(url) {
      devSession?.stop();
      devSession = new PluginDevSession(url, {
        fetch: (target) => fetch(target, { cache: 'no-store' } as RequestInit),
        locales: () => [i18n.language],
        onPlugin: (plugin) => {
          devPlugin = plugin;
          sync();
        },
        onStatus: setDevStatus,
        onStop: () => {
          devPlugin = undefined;
          sync();
        },
      });
      devSession.start();
    },
    disconnectDevServer() {
      devSession?.stop();
      devSession = undefined;
    },
    getDevStatus: () => devStatus,
    subscribeDevStatus(listener) {
      devListeners.add(listener);
      return () => {
        devListeners.delete(listener);
      };
    },
  };
}

/** Defers opening the database until a plugin first touches its storage. */
function lazyStorage(): PluginStorageRepository {
  let repository: Promise<SQLitePluginStorageRepository> | undefined;
  const get = () => (repository ??= getLunarDatabase().then((database) => new SQLitePluginStorageRepository(database)));
  return {
    get: async (pluginId, key) => (await get()).get(pluginId, key),
    set: async (pluginId, key, value, size) => (await get()).set(pluginId, key, value, size),
    delete: async (pluginId, key) => (await get()).delete(pluginId, key),
    keys: async (pluginId, prefix) => (await get()).keys(pluginId, prefix),
    totalBytes: async (pluginId, excluding) => (await get()).totalBytes(pluginId, excluding),
    clear: async (pluginId) => (await get()).clear(pluginId),
  };
}
