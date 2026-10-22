import { compareVersions } from '@lunar/plugin-sdk/manifest';
import type { Sha256 } from '@lunar/plugin-sdk/package-format';

import type { InstalledPlugin } from '../domain/installed-plugin';
import { LunarPluginError } from '../domain/plugin-error';
import type { PluginRecordRepository, PluginStorageRepository } from '../repositories/plugin-repository';
import { readPluginPackage, type PluginPackage } from './plugin-package';

export interface PluginFileStore {
  write(pluginId: string, version: string, files: ReadonlyMap<string, Uint8Array>): string;
  remove(pluginId: string, keepVersion?: string): void;
}

export interface PluginInstallerDependencies {
  readonly records: PluginRecordRepository;
  readonly storage: PluginStorageRepository;
  readonly files: PluginFileStore;
  readonly sha256: Sha256;
  readonly now?: () => number;
}

export type PluginInstallKind = 'install' | 'update' | 'downgrade' | 'reinstall';

/** A validated package awaiting the user's confirmation. */
export interface PluginInstallPreview {
  readonly package: PluginPackage;
  readonly kind: PluginInstallKind;
  readonly current?: InstalledPlugin;
  /** Permissions the installed version did not request. */
  readonly addedPermissions: readonly string[];
}

export class PluginInstaller {
  constructor(private readonly deps: PluginInstallerDependencies) {}

  async inspect(archive: Uint8Array): Promise<PluginInstallPreview> {
    const pluginPackage = await readPluginPackage(archive, this.deps.sha256);
    const manifest = pluginPackage.manifest;
    const current = (await this.deps.records.list()).find((plugin) => plugin.id === manifest.id);
    if (current && current.version === manifest.version && current.packageSha256 !== pluginPackage.packageSha256) {
      throw new LunarPluginError(
        'INTEGRITY_FAILED',
        `Version ${manifest.version} is already installed with different contents; publish a new version`,
      );
    }
    const order = current ? compareVersions(manifest.version, current.version) : 1;
    const known = new Set(current?.manifest.permissions.map((item) => item.name) ?? []);
    return {
      package: pluginPackage,
      current,
      kind: !current ? 'install' : order > 0 ? 'update' : order < 0 ? 'downgrade' : 'reinstall',
      addedPermissions: manifest.permissions.map((item) => item.name).filter((name) => !known.has(name)),
    };
  }

  /** Writes the package and its record; earlier versions are removed once the new record is saved. */
  async install(preview: PluginInstallPreview): Promise<InstalledPlugin> {
    const { manifest, files, locales, packageSha256, entrySha256 } = preview.package;
    const now = this.deps.now?.() ?? Date.now();
    const directoryUri = this.deps.files.write(manifest.id, manifest.version, files);
    const plugin: InstalledPlugin = {
      id: manifest.id,
      version: manifest.version,
      // Packages are not signature-verified yet, so every local package is a community package.
      source: 'community',
      manifest,
      locales,
      directoryUri,
      packageSha256,
      entrySha256,
      installedAt: preview.current?.installedAt ?? now,
      updatedAt: now,
    };
    try {
      await this.deps.records.save(plugin);
    } catch (error) {
      if (preview.current?.version !== manifest.version) this.deps.files.remove(manifest.id, preview.current?.version);
      throw error;
    }
    return plugin;
  }

  /** Removes versions left behind by updates that have since been applied. */
  cleanUp(plugin: InstalledPlugin): void {
    this.deps.files.remove(plugin.id, plugin.version);
  }

  async uninstall(pluginId: string, keepData: boolean): Promise<void> {
    await this.deps.records.remove(pluginId);
    this.deps.files.remove(pluginId);
    if (!keepData) await this.deps.storage.clear(pluginId);
  }
}
