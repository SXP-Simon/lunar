import { describe, expect, it, vi } from 'vitest';

import type { InstalledPlugin } from '../../src/features/plugins/domain/installed-plugin';
import type { PluginRecordRepository } from '../../src/features/plugins/repositories/plugin-repository';
import { PluginInstaller } from '../../src/features/plugins/services/plugin-installer';
import { createTestHost, manifest, memoryStorage, packArchive, plugin, sha256 } from './plugin-test-support';

const id = 'org.example.test';
const versioned = (version: string, dataVersion: number, body: string, previous?: InstalledPlugin) =>
  plugin(`exports.default = { ${body} };`, {
    version,
    manifest: manifest({ version, dataVersion }),
    previous,
  });

describe('plugin data migration', () => {
  it('records the data version of a plugin without data and skips migrate()', async () => {
    const { host, deps } = createTestHost();
    const migrate = vi.fn();
    (globalThis as { __migrate?: unknown }).__migrate = migrate;
    host.setPlugins([{ plugin: versioned('1.0.0', 3, 'migrate: globalThis.__migrate, activate() {}'), enabled: true }]);
    expect(await host.ensureActive(id)).toBe(true);
    expect(migrate).not.toHaveBeenCalled();
    expect(deps.storage.versions.get(id)).toBe(3);
  });

  it('migrates unversioned data from version 1 before activate() runs', async () => {
    const storage = memoryStorage();
    await storage.set(id, 'old', '{"pages":2}', 10);
    const { host } = createTestHost({ storage });
    const order: string[] = [];
    (globalThis as { __order?: string[] }).__order = order;
    host.setPlugins([
      {
        plugin: versioned(
          '2.0.0',
          2,
          `async migrate(ctx) {
            globalThis.__order.push('migrate ' + ctx.from + '>' + ctx.to);
            await ctx.storage.set('old', { pages: 2, migrated: true });
          },
          activate() { globalThis.__order.push('activate'); }`,
        ),
        enabled: true,
      },
    ]);
    expect(await host.ensureActive(id)).toBe(true);
    expect(order).toEqual(['migrate 1>2', 'activate']);
    expect(storage.versions.get(id)).toBe(2);
    expect(storage.data.get(`${id}\u0000old`)).toBe('{"pages":2,"migrated":true}');
  });

  it('restores the data when migrate() fails and refuses a plugin without migrate()', async () => {
    const storage = memoryStorage();
    await storage.set(id, 'old', '1', 1);
    await storage.setDataVersion(id, 1);
    const { host } = createTestHost({ storage });
    host.setPlugins([
      {
        plugin: versioned(
          '2.0.0',
          2,
          `async migrate(ctx) { await ctx.storage.set('old', 2); await ctx.storage.set('new', 3); throw new Error('bad data'); },
          activate() {}`,
        ),
        enabled: true,
      },
    ]);
    expect(await host.ensureActive(id)).toBe(false);
    expect(host.getStatuses()[0].error).toBe('MIGRATION_FAILED: Data migration from 1 to 2 failed: bad data');
    expect(Object.fromEntries(storage.data)).toEqual({ [`${id}\u0000old`]: '1' });
    expect(storage.versions.get(id)).toBe(1);

    const second = createTestHost({ storage });
    second.host.setPlugins([{ plugin: versioned('2.0.1', 2, 'activate() {}'), enabled: true }]);
    expect(await second.host.ensureActive(id)).toBe(false);
    expect(second.host.getStatuses()[0].error).toContain('defines no migrate()');
  });
});

describe('plugin updates', () => {
  const previous = versioned('1.0.0', 1, 'activate() {}');

  it('releases the replaced version after the first successful activation', async () => {
    const commit = vi.fn(async (current: InstalledPlugin) => ({ ...current, previous: undefined }));
    const { host } = createTestHost({ updates: { commit, revert: vi.fn() } });
    host.setPlugins([{ plugin: versioned('1.1.0', 1, 'activate() {}', previous), enabled: true }]);
    expect(await host.ensureActive(id)).toBe(true);
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect(host.getEntry(id)?.plugin.previous).toBeUndefined();
  });

  it('restores the replaced version and its data when the update fails to start', async () => {
    const storage = memoryStorage();
    await storage.set(id, 'kept', '"v1"', 4);
    await storage.setDataVersion(id, 1);
    const revert = vi.fn(async (current: InstalledPlugin) => current.previous);
    const scheduled: (() => void)[] = [];
    const { host } = createTestHost({
      storage,
      updates: { commit: vi.fn(), revert },
      schedule: (task) => scheduled.push(task),
    });
    host.setPlugins([
      {
        plugin: versioned(
          '2.0.0',
          2,
          `async migrate(ctx) { await ctx.storage.set('kept', 'v2'); },
          activate() { throw new Error('broken'); }`,
          previous,
        ),
        enabled: true,
      },
    ]);
    expect(await host.ensureActive(id)).toBe(false);
    expect(revert).toHaveBeenCalledOnce();
    expect(storage.data.get(`${id}\u0000kept`)).toBe('"v1"');
    expect(storage.versions.get(id)).toBe(1);
    expect(host.getStatuses()[0]).toMatchObject({
      state: 'idle',
      plugin: { version: '1.0.0' },
      notice: { kind: 'reverted', failedVersion: '2.0.0', restoredVersion: '1.0.0', reason: 'broken' },
    });
    // The restored version starts on its own afterwards.
    scheduled.forEach((task) => task());
    await vi.waitFor(() => expect(host.getStatuses()[0].state).toBe('active'));
  });

  it('forwards log entries', async () => {
    const onLog = vi.fn();
    const { host } = createTestHost({ onLog });
    host.setPlugins([
      { plugin: versioned('1.0.0', 1, 'activate(ctx) { ctx.log.info("hello", { n: 1 }); }'), enabled: true },
    ]);
    await host.ensureActive(id);
    expect(onLog).toHaveBeenCalledWith(id, expect.objectContaining({ level: 'info', message: 'hello {"n":1}' }));
  });
});

describe('plugin installer versions', () => {
  function setup() {
    const records = new Map<string, InstalledPlugin>();
    const repository: PluginRecordRepository = {
      list: async () => [...records.values()],
      save: async (record) => {
        records.set(record.id, record);
      },
      remove: async (pluginId) => {
        records.delete(pluginId);
      },
    };
    const removed: (readonly string[] | undefined)[] = [];
    const installer = new PluginInstaller({
      records: repository,
      storage: memoryStorage(),
      sha256: async (bytes) => sha256(bytes),
      files: {
        write: (pluginId, version) => `file:///plugins/${pluginId}/${version}`,
        remove: (_pluginId, keep) => removed.push(keep),
      },
      now: () => 5,
    });
    const archive = async (version: string, dataVersion = 1) =>
      installer.inspect(
        await packArchive({
          'manifest.json': JSON.stringify({ ...manifest({ version, dataVersion }), name: 'Test' }),
          'main.js': 'exports.default = { activate() {} };',
        }),
      );
    return { installer, records, removed, archive };
  }

  it('keeps the last version that ran until the update activates', async () => {
    const { installer, records, removed, archive } = setup();
    await installer.install(await archive('1.0.0'));
    const update = await archive('1.1.0', 2);
    expect(update).toMatchObject({ kind: 'update', migratesData: true });
    const installed = await installer.install(update);
    expect(installed.previous?.version).toBe('1.0.0');
    // A second update before the first one ran still falls back to 1.0.0.
    const again = await installer.install(await archive('1.2.0', 2));
    expect(again.previous?.version).toBe('1.0.0');
    installer.cleanUp(again);
    expect(removed.at(-1)).toEqual(['1.2.0', '1.0.0']);

    const committed = await installer.commit(again);
    expect(records.get(id)).toEqual(committed);
    expect(committed.previous).toBeUndefined();
    expect(removed.at(-1)).toEqual(['1.2.0']);
  });

  it('reverts to the replaced version', async () => {
    const { installer, records, archive } = setup();
    await installer.install(await archive('1.0.0'));
    const update = await installer.install(await archive('2.0.0'));
    const restored = await installer.revert(update);
    expect(restored?.version).toBe('1.0.0');
    expect(records.get(id)?.version).toBe('1.0.0');
    expect(await installer.revert(restored!)).toBeUndefined();
  });
});
