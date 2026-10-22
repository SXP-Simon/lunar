import type { InstalledPlugin } from '../domain/installed-plugin';

export interface PluginRecordRepository {
  list(): Promise<readonly InstalledPlugin[]>;
  save(plugin: InstalledPlugin): Promise<void>;
  remove(pluginId: string): Promise<void>;
}

/** Plugin-private JSON values, keyed by the host-assigned plugin identity. */
export interface PluginStorageRepository {
  get(pluginId: string, key: string): Promise<string | undefined>;
  set(pluginId: string, key: string, valueJson: string, byteSize: number): Promise<void>;
  delete(pluginId: string, key: string): Promise<void>;
  keys(pluginId: string, prefix?: string): Promise<readonly string[]>;
  totalBytes(pluginId: string, excludingKey?: string): Promise<number>;
  /** Deletes the plugin's values, data version and snapshot. */
  clear(pluginId: string): Promise<void>;
  /** Format version of the stored data; undefined before the plugin first records one. */
  getDataVersion(pluginId: string): Promise<number | undefined>;
  setDataVersion(pluginId: string, version: number): Promise<void>;
  /** Copies the values and data version aside, replacing an earlier snapshot. */
  snapshot(pluginId: string): Promise<void>;
  /** Puts the snapshot back in place of the current data; resolves `false` without one. */
  restoreSnapshot(pluginId: string): Promise<boolean>;
  dropSnapshot(pluginId: string): Promise<void>;
}
