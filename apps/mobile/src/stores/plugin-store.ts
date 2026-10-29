import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStateStorage } from './mmkv-state-storage';

/** A JSON-compatible value that a plugin setting can hold. */
export type PluginSettingValue =
  string | number | boolean | null | PluginSettingValue[] | { [key: string]: PluginSettingValue };

/** How many plugin entries the app's bottom navigation holds next to the built-in tabs. */
export const MAX_PLUGIN_TABS = 2;

interface PluginStoreState {
  /** Plugins the user enabled; absent means disabled. */
  readonly enabled: Readonly<Record<string, boolean>>;
  /** User-chosen order of plugin entries in shared extension points. */
  readonly order: readonly string[];
  /** Plugins the user pinned to the bottom navigation, in tab order. */
  readonly tabs: readonly string[];
  readonly settings: Readonly<Record<string, Readonly<Record<string, PluginSettingValue>>>>;
  readonly developerMode: boolean;
  /**
   * The plugin whose activation was in progress when the app last stopped.
   * A value that survives a restart means activation crashed the app.
   */
  readonly activatingPluginId?: string;
  /** Start the next launch with every plugin paused. */
  readonly safeModeRequested: boolean;
  setEnabled(pluginId: string, enabled: boolean): void;
  setSetting(pluginId: string, key: string, value: PluginSettingValue): void;
  /** Pinning past `MAX_PLUGIN_TABS` is ignored. */
  setTabPinned(pluginId: string, pinned: boolean): void;
  setDeveloperMode(enabled: boolean): void;
  setActivatingPlugin(pluginId: string | undefined): void;
  setSafeModeRequested(requested: boolean): void;
  /** Forgets the plugin's preferences when it is uninstalled. */
  removePlugin(pluginId: string): void;
}

type PersistedPluginPreferences = Pick<
  PluginStoreState,
  'enabled' | 'order' | 'tabs' | 'settings' | 'developerMode' | 'activatingPluginId' | 'safeModeRequested'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePersisted(value: unknown): Partial<PersistedPluginPreferences> {
  if (!isRecord(value)) return {};
  const enabled = isRecord(value.enabled)
    ? Object.fromEntries(Object.entries(value.enabled).filter(([, item]) => item === true))
    : {};
  const order = Array.isArray(value.order)
    ? value.order.filter((item): item is string => typeof item === 'string')
    : [];
  const tabs = Array.isArray(value.tabs)
    ? [...new Set(value.tabs.filter((item): item is string => typeof item === 'string'))].slice(0, MAX_PLUGIN_TABS)
    : [];
  const settings = isRecord(value.settings)
    ? (Object.fromEntries(Object.entries(value.settings).filter(([, item]) => isRecord(item))) as Record<
        string,
        Record<string, PluginSettingValue>
      >)
    : {};
  return {
    enabled: enabled as Record<string, boolean>,
    order,
    tabs,
    settings,
    developerMode: value.developerMode === true,
    activatingPluginId: typeof value.activatingPluginId === 'string' ? value.activatingPluginId : undefined,
    safeModeRequested: value.safeModeRequested === true,
  };
}

export const usePluginStore = create<PluginStoreState>()(
  persist<PluginStoreState, [], [], PersistedPluginPreferences>(
    (set) => ({
      enabled: {},
      order: [],
      tabs: [],
      settings: {},
      developerMode: false,
      safeModeRequested: false,
      setEnabled: (pluginId, enabled) =>
        set((state) => {
          const next = { ...state.enabled };
          if (enabled) next[pluginId] = true;
          else delete next[pluginId];
          return {
            enabled: next,
            order: state.order.includes(pluginId) ? state.order : [...state.order, pluginId],
          };
        }),
      setSetting: (pluginId, key, value) =>
        set((state) => ({
          settings: { ...state.settings, [pluginId]: { ...state.settings[pluginId], [key]: value } },
        })),
      setTabPinned: (pluginId, pinned) =>
        set((state) => {
          const included = state.tabs.includes(pluginId);
          if (pinned === included || (pinned && state.tabs.length >= MAX_PLUGIN_TABS)) return state;
          return { tabs: pinned ? [...state.tabs, pluginId] : state.tabs.filter((item) => item !== pluginId) };
        }),
      setDeveloperMode: (developerMode) => set({ developerMode }),
      setActivatingPlugin: (activatingPluginId) => set({ activatingPluginId }),
      setSafeModeRequested: (safeModeRequested) => set({ safeModeRequested }),
      removePlugin: (pluginId) =>
        set((state) => {
          const enabled = { ...state.enabled };
          const settings = { ...state.settings };
          delete enabled[pluginId];
          delete settings[pluginId];
          return {
            enabled,
            settings,
            order: state.order.filter((item) => item !== pluginId),
            tabs: state.tabs.filter((item) => item !== pluginId),
          };
        }),
    }),
    {
      name: 'settings.plugins',
      storage: createJSONStorage(() => mmkvStateStorage),
      partialize: ({ enabled, order, tabs, settings, developerMode, activatingPluginId, safeModeRequested }) => ({
        enabled,
        order,
        tabs,
        settings,
        developerMode,
        activatingPluginId,
        safeModeRequested,
      }),
      merge: (persisted, current) => ({ ...current, ...normalizePersisted(persisted) }),
    },
  ),
);
