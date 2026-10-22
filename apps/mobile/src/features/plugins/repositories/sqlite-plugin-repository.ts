import type { SQLiteDatabase } from 'expo-sqlite';
import { parsePluginManifest } from '@lunar/plugin-sdk/manifest';
import type { PluginSource } from '@lunar/plugin-sdk';

import type { InstalledPlugin, PluginLocales } from '../domain/installed-plugin';
import type { PluginRecordRepository, PluginStorageRepository } from './plugin-repository';

interface PluginRow {
  readonly id: string;
  readonly version: string;
  readonly source: string;
  readonly manifest_json: string;
  readonly locales_json: string;
  readonly package_sha256: string;
  readonly entry_sha256: string;
  readonly directory_uri: string;
  readonly installed_at: number;
  readonly updated_at: number;
}

export class SQLitePluginRecordRepository implements PluginRecordRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async list(): Promise<readonly InstalledPlugin[]> {
    const rows = await this.database.getAllAsync<PluginRow>('SELECT * FROM plugins ORDER BY id');
    return rows.flatMap((row) => {
      // A record whose manifest no longer validates stays out of the runtime.
      const parsed = parseJson(row.manifest_json);
      const manifest = parsed === undefined ? undefined : parsePluginManifest(parsed);
      if (!manifest?.ok || manifest.manifest.id !== row.id) return [];
      return [
        {
          id: row.id,
          version: row.version,
          source: (row.source === 'official' ? 'official' : 'community') as PluginSource,
          manifest: manifest.manifest,
          locales: (parseJson(row.locales_json) ?? {}) as PluginLocales,
          packageSha256: row.package_sha256,
          entrySha256: row.entry_sha256,
          directoryUri: row.directory_uri,
          installedAt: row.installed_at,
          updatedAt: row.updated_at,
        },
      ];
    });
  }

  async save(plugin: InstalledPlugin): Promise<void> {
    if (!plugin.directoryUri || !plugin.packageSha256 || !plugin.entrySha256) {
      throw new Error('Only installed packages can be saved');
    }
    await this.database.runAsync(
      `INSERT INTO plugins (id, version, source, manifest_json, locales_json, package_sha256, entry_sha256,
         directory_uri, installed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         version = excluded.version,
         source = excluded.source,
         manifest_json = excluded.manifest_json,
         locales_json = excluded.locales_json,
         package_sha256 = excluded.package_sha256,
         entry_sha256 = excluded.entry_sha256,
         directory_uri = excluded.directory_uri,
         updated_at = excluded.updated_at`,
      plugin.id,
      plugin.version,
      plugin.source,
      JSON.stringify(plugin.manifest),
      JSON.stringify(plugin.locales),
      plugin.packageSha256,
      plugin.entrySha256,
      plugin.directoryUri,
      plugin.installedAt,
      plugin.updatedAt,
    );
  }

  async remove(pluginId: string): Promise<void> {
    await this.database.runAsync('DELETE FROM plugins WHERE id = ?', pluginId);
  }
}

export class SQLitePluginStorageRepository implements PluginStorageRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async get(pluginId: string, key: string): Promise<string | undefined> {
    const row = await this.database.getFirstAsync<{ value_json: string }>(
      'SELECT value_json FROM plugin_storage WHERE plugin_id = ? AND key = ?',
      pluginId,
      key,
    );
    return row?.value_json;
  }

  async set(pluginId: string, key: string, valueJson: string, byteSize: number): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO plugin_storage (plugin_id, key, value_json, byte_size, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(plugin_id, key) DO UPDATE SET
         value_json = excluded.value_json,
         byte_size = excluded.byte_size,
         updated_at = excluded.updated_at`,
      pluginId,
      key,
      valueJson,
      byteSize,
      Date.now(),
    );
  }

  async delete(pluginId: string, key: string): Promise<void> {
    await this.database.runAsync('DELETE FROM plugin_storage WHERE plugin_id = ? AND key = ?', pluginId, key);
  }

  async keys(pluginId: string, prefix = ''): Promise<readonly string[]> {
    const rows = await this.database.getAllAsync<{ key: string }>(
      // substr comparison avoids LIKE wildcards in plugin-chosen prefixes.
      'SELECT key FROM plugin_storage WHERE plugin_id = ? AND substr(key, 1, ?) = ? ORDER BY key',
      pluginId,
      prefix.length,
      prefix,
    );
    return rows.map((row) => row.key);
  }

  async totalBytes(pluginId: string, excludingKey?: string): Promise<number> {
    const row = await this.database.getFirstAsync<{ total: number | null }>(
      'SELECT SUM(byte_size) AS total FROM plugin_storage WHERE plugin_id = ? AND key IS NOT ?',
      pluginId,
      excludingKey ?? null,
    );
    return row?.total ?? 0;
  }

  async clear(pluginId: string): Promise<void> {
    await this.database.runAsync('DELETE FROM plugin_storage WHERE plugin_id = ?', pluginId);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
