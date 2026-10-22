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
  clear(pluginId: string): Promise<void>;
}
