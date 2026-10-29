import { afterEach, describe, expect, it, vi } from 'vitest';

import { mmkvStateStorage } from '../../src/stores/mmkv-state-storage';
import { MAX_PLUGIN_TABS, usePluginStore } from '../../src/stores/plugin-store';

const persistedValues = vi.hoisted(() => new Map<string, string>());

vi.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => persistedValues.get(key),
    set: (key: string, value: string) => {
      persistedValues.set(key, value);
    },
    remove: (key: string) => persistedValues.delete(key),
  }),
}));

const PLUGIN_SETTINGS_KEY = 'settings.plugins';

afterEach(() => {
  usePluginStore.setState({ enabled: {}, order: [], tabs: [], settings: {} });
  mmkvStateStorage.removeItem(PLUGIN_SETTINGS_KEY);
});

describe('plugin tab pins', () => {
  it('pins plugins in order up to the bottom navigation limit and persists them', () => {
    const ids = Array.from({ length: MAX_PLUGIN_TABS + 1 }, (_, index) => `org.example.p${index}`);
    for (const id of ids) usePluginStore.getState().setTabPinned(id, true);
    usePluginStore.getState().setTabPinned(ids[0], true);

    const pinned = ids.slice(0, MAX_PLUGIN_TABS);
    expect(usePluginStore.getState().tabs).toEqual(pinned);
    const persisted = JSON.parse(mmkvStateStorage.getItem(PLUGIN_SETTINGS_KEY) as string) as {
      state: { tabs: string[] };
    };
    expect(persisted.state.tabs).toEqual(pinned);
  });

  it('unpins on request and when the plugin is removed', () => {
    const store = usePluginStore.getState();
    store.setTabPinned('org.example.a', true);
    store.setTabPinned('org.example.b', true);
    store.setTabPinned('org.example.a', false);
    expect(usePluginStore.getState().tabs).toEqual(['org.example.b']);
    usePluginStore.getState().removePlugin('org.example.b');
    expect(usePluginStore.getState().tabs).toEqual([]);
  });

  it('restores pins written before the limit or without the field', async () => {
    mmkvStateStorage.setItem(
      PLUGIN_SETTINGS_KEY,
      JSON.stringify({ state: { tabs: ['org.example.a', 'org.example.a', 4, 'b', 'c'] }, version: 0 }),
    );
    await usePluginStore.persist.rehydrate();
    expect(usePluginStore.getState().tabs).toEqual(['org.example.a', 'b', 'c'].slice(0, MAX_PLUGIN_TABS));

    mmkvStateStorage.setItem(PLUGIN_SETTINGS_KEY, JSON.stringify({ state: { enabled: {} }, version: 0 }));
    await usePluginStore.persist.rehydrate();
    expect(usePluginStore.getState().tabs).toEqual([]);
  });
});
