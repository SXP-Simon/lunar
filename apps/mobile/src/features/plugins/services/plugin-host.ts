import type { ComponentType } from 'react';
import type { CommandSource, ConfirmOptions, HostInfo, JsonValue, ToastTone } from '@lunar/plugin-sdk';
import { localizeManifestText, type PluginActivationEvent } from '@lunar/plugin-sdk/manifest';

import type { InstalledPlugin, PluginLogEntry, PluginRunState, PluginStatus } from '../domain/installed-plugin';
import { LunarPluginError, pluginErrorMessage } from '../domain/plugin-error';
import type { PluginStorageRepository } from '../repositories/plugin-repository';
import { createPluginContext } from './plugin-context';
import { PluginGeneration } from './plugin-generation';
import { createPluginRequire, evaluatePluginEntry } from './plugin-loader';
import type { PluginNetwork } from './plugin-network';
import { pickMessages } from './plugin-locale';
import { PluginReaderBridge } from './plugin-reader-bridge';

export const PLUGIN_HOST_LIMITS = {
  activationTimeoutMs: 1_000,
  deactivationTimeoutMs: 1_000,
  crashWindowMs: 10 * 60_000,
  crashesBeforeDisable: 3,
  logEntries: 200,
} as const;

export interface PluginSettingsAccess {
  get(pluginId: string, key: string): JsonValue | undefined;
  set(pluginId: string, key: string, value: JsonValue): void;
  subscribe(listener: () => void): () => void;
}

export interface PluginUiBridge {
  toast(message: string, tone: ToastTone): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
  openRoute(pluginId: string, pageId: string, params: Readonly<Record<string, string>>): void;
}

export interface PluginHostDependencies {
  readonly modules: Readonly<Record<string, unknown>>;
  readonly readEntry: (plugin: InstalledPlugin) => Promise<string>;
  readonly settings: PluginSettingsAccess;
  readonly storage: PluginStorageRepository;
  readonly network: PluginNetwork;
  readonly clipboard: (text: string) => Promise<void>;
  readonly ui: PluginUiBridge;
  readonly hostInfo: () => Omit<HostInfo, 'capabilities' | 'sdkVersion'>;
  /** Persists which plugin is activating so a crash during activation is detected on the next launch. */
  readonly markActivation: (pluginId: string | undefined) => void;
  readonly onAutoDisabled: (pluginId: string, reason: string) => void;
  readonly now?: () => number;
  /** Runs a task when the JavaScript thread is idle. */
  readonly schedule?: (task: () => void) => void;
}

export interface PluginEntry {
  plugin: InstalledPlugin;
  enabled: boolean;
  state: PluginRunState;
  generation?: PluginGeneration;
  /** The generation being activated, not yet visible to lookups. */
  pending?: PluginGeneration;
  generationCount: number;
  activation?: Promise<boolean>;
  error?: string;
  activationMs?: number;
  pendingPlugin?: InstalledPlugin;
  crashes: number[];
  logs: PluginLogEntry[];
}

export interface PluginListing {
  readonly plugin: InstalledPlugin;
  readonly enabled: boolean;
}

export class PluginHost {
  readonly reader: PluginReaderBridge;
  private readonly entries = new Map<string, PluginEntry>();
  private readonly listeners = new Set<() => void>();
  private readonly storageListeners = new Map<string, Set<() => void>>();
  private order: readonly string[] = [];
  private version = 0;
  private statusCache?: { version: number; statuses: readonly PluginStatus[] };

  constructor(readonly deps: PluginHostDependencies) {
    this.reader = new PluginReaderBridge(this);
  }

  now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  schedule(task: () => void): void {
    if (this.deps.schedule) this.deps.schedule(task);
    else setTimeout(task, 0);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  notify(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  /** Reconciles the installed and enabled plugins; removed or disabled plugins stop. */
  setPlugins(listings: readonly PluginListing[], order: readonly string[] = this.order): void {
    this.order = order;
    const next = new Set(listings.map((listing) => listing.plugin.id));
    for (const [id, entry] of this.entries) {
      if (!next.has(id)) {
        void this.stop(entry);
        this.entries.delete(id);
      }
    }
    for (const listing of listings) {
      const entry = this.entries.get(listing.plugin.id);
      if (!entry) {
        this.entries.set(listing.plugin.id, {
          plugin: listing.plugin,
          enabled: listing.enabled,
          state: 'idle',
          generationCount: 0,
          crashes: [],
          logs: [],
        });
        continue;
      }
      const target = entry.pendingPlugin ?? entry.plugin;
      if (target.version !== listing.plugin.version || target.inlineEntry !== listing.plugin.inlineEntry) {
        this.applyPlugin(entry, listing.plugin);
      }
      if (entry.enabled !== listing.enabled) {
        entry.enabled = listing.enabled;
        if (!listing.enabled) void this.stop(entry);
      }
    }
    this.notify();
  }

  async removePlugin(pluginId: string): Promise<void> {
    const entry = this.entries.get(pluginId);
    if (!entry) return;
    await this.stop(entry);
    this.entries.delete(pluginId);
    this.notify();
  }

  /**
   * Switches an entry to another version. Code that already ran in this
   * process stays loaded until restart, except development builds, which reload.
   */
  private applyPlugin(entry: PluginEntry, plugin: InstalledPlugin): void {
    if (entry.generationCount > 0 && plugin.source !== 'development' && entry.plugin.source !== 'development') {
      entry.pendingPlugin = plugin;
      return;
    }
    const wasActive = entry.state === 'active' || entry.state === 'activating';
    // Running generations keep the plugin they started with; the swap only affects later activations.
    entry.plugin = plugin;
    entry.pendingPlugin = undefined;
    entry.error = undefined;
    void this.stop(entry).then(() => {
      entry.state = 'idle';
      this.notify();
      if (wasActive && entry.plugin === plugin) void this.ensureActive(plugin.id);
    });
  }

  /** Whether the plugin's newest version waits for an app restart. */
  hasPendingVersion(pluginId: string): boolean {
    return this.entries.get(pluginId)?.pendingPlugin !== undefined;
  }

  getStatuses = (): readonly PluginStatus[] => {
    if (this.statusCache?.version === this.version) return this.statusCache.statuses;
    const statuses = this.orderedEntries().map((entry): PluginStatus => ({
      plugin: entry.plugin,
      enabled: entry.enabled,
      state: entry.state,
      generation: entry.generationCount,
      error: entry.error,
      activationMs: entry.activationMs,
      pendingVersion: entry.pendingPlugin?.version,
    }));
    this.statusCache = { version: this.version, statuses };
    return statuses;
  };

  getEntry(pluginId: string): PluginEntry | undefined {
    return this.entries.get(pluginId);
  }

  /** Enabled plugins in the user's order, then by name. */
  enabledEntries(): readonly PluginEntry[] {
    return this.orderedEntries().filter((entry) => entry.enabled);
  }

  /** Committed generations of enabled plugins, in order. */
  activeGenerations(): readonly (readonly [PluginEntry, PluginGeneration])[] {
    return this.enabledEntries().flatMap((entry) =>
      entry.generation?.committed ? [[entry, entry.generation] as const] : [],
    );
  }

  private orderedEntries(): PluginEntry[] {
    const rank = new Map(this.order.map((id, index) => [id, index]));
    return [...this.entries.values()].sort(
      (left, right) =>
        (rank.get(left.plugin.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(right.plugin.id) ?? Number.MAX_SAFE_INTEGER) ||
        left.plugin.manifest.name.localeCompare(right.plugin.manifest.name),
    );
  }

  async trigger(event: PluginActivationEvent): Promise<void> {
    const targets = this.enabledEntries().filter((entry) => entry.plugin.manifest.activationEvents.includes(event));
    await Promise.all(targets.map((entry) => this.ensureActive(entry.plugin.id)));
  }

  /** Activates an enabled plugin once; concurrent callers share the same activation. */
  ensureActive(pluginId: string): Promise<boolean> {
    const entry = this.entries.get(pluginId);
    if (!entry || !entry.enabled) return Promise.resolve(false);
    if (entry.state === 'active' && entry.generation && !entry.generation.disposed) return Promise.resolve(true);
    entry.activation ??= this.activate(entry).finally(() => {
      entry.activation = undefined;
    });
    return entry.activation;
  }

  private async activate(entry: PluginEntry): Promise<boolean> {
    const plugin = entry.plugin;
    entry.generationCount += 1;
    const generation = new PluginGeneration(entry.generationCount);
    entry.pending = generation;
    entry.state = 'activating';
    entry.error = undefined;
    this.notify();
    const startedAt = this.now();
    this.deps.markActivation(plugin.id);
    try {
      const source = plugin.inlineEntry ?? (await this.deps.readEntry(plugin));
      generation.assertLive();
      generation.definition = evaluatePluginEntry(
        source,
        createPluginRequire(this.deps.modules),
        `lunar-plugin://${plugin.id}/${plugin.version}/main.js`,
      );
      generation.context = createPluginContext(this, entry, generation);
      await withTimeout(
        Promise.resolve(generation.definition.activate(generation.context)),
        PLUGIN_HOST_LIMITS.activationTimeoutMs,
        'activate() did not finish in time',
      );
      generation.assertLive();
      generation.committed = true;
      entry.generation = generation;
      entry.pending = undefined;
      entry.state = 'active';
      entry.activationMs = this.now() - startedAt;
      this.log(entry, 'info', `Activated generation ${generation.number} in ${entry.activationMs} ms`);
      this.reader.generationCommitted(entry, generation);
      return true;
    } catch (error) {
      // stop() detaches and disposes a pending generation; its state is already settled.
      const stopped = generation.disposed && entry.pending !== generation;
      if (entry.pending === generation) entry.pending = undefined;
      this.disposeGeneration(entry, generation);
      if (!stopped) {
        entry.state = 'failed';
        entry.error = pluginErrorMessage(error);
        this.log(entry, 'error', `Activation failed: ${entry.error}`);
      }
      return false;
    } finally {
      this.deps.markActivation(undefined);
      this.notify();
    }
  }

  async deactivate(pluginId: string): Promise<void> {
    const entry = this.entries.get(pluginId);
    if (entry) await this.stop(entry);
  }

  private async stop(entry: PluginEntry): Promise<void> {
    const pending = entry.pending;
    if (pending) {
      entry.pending = undefined;
      this.disposeGeneration(entry, pending);
    }
    const generation = entry.generation;
    entry.generation = undefined;
    if (entry.state !== 'failed') entry.state = 'idle';
    if (!generation) {
      this.notify();
      return;
    }
    this.reader.generationEnded(entry.plugin.id);
    this.notify();
    try {
      await withTimeout(
        Promise.resolve(generation.definition?.deactivate?.()),
        PLUGIN_HOST_LIMITS.deactivationTimeoutMs,
        'deactivate() did not finish in time',
      );
    } catch (error) {
      this.log(entry, 'warn', `Deactivation failed: ${pluginErrorMessage(error)}`);
    }
    this.disposeGeneration(entry, generation);
    this.notify();
  }

  private disposeGeneration(entry: PluginEntry, generation: PluginGeneration): void {
    for (const error of generation.dispose()) {
      this.log(entry, 'warn', `A subscription failed to dispose: ${pluginErrorMessage(error)}`);
    }
  }

  async executeCommand(pluginId: string, commandId: string, source: CommandSource, args?: JsonValue): Promise<void> {
    if (!(await this.ensureActive(pluginId))) return;
    const entry = this.entries.get(pluginId);
    const generation = entry?.generation;
    const handler = generation?.commands.get(commandId);
    if (!entry || !generation || !handler) {
      if (entry) this.log(entry, 'warn', `Command ${commandId} has no registered handler`);
      return;
    }
    try {
      await handler({ source, args, signal: generation.abort.signal });
    } catch (error) {
      this.log(entry, 'error', `Command ${commandId} failed: ${pluginErrorMessage(error)}`);
      this.deps.ui.toast(this.localize(pluginId, entry.plugin.manifest.name), 'danger');
    }
  }

  getComponent<P>(pluginId: string, key: string): ComponentType<P> | undefined {
    return this.entries.get(pluginId)?.generation?.components.get(key) as ComponentType<P> | undefined;
  }

  /** Counts a rendering or runtime failure; repeated failures disable the plugin. */
  reportCrash(pluginId: string, error: unknown, origin: string): void {
    const entry = this.entries.get(pluginId);
    if (!entry) return;
    const now = this.now();
    entry.crashes = [...entry.crashes.filter((at) => now - at < PLUGIN_HOST_LIMITS.crashWindowMs), now];
    this.log(entry, 'error', `${origin} crashed: ${pluginErrorMessage(error)}`);
    if (entry.crashes.length >= PLUGIN_HOST_LIMITS.crashesBeforeDisable && entry.enabled) {
      entry.enabled = false;
      entry.error = `Disabled after ${entry.crashes.length} failures`;
      void this.stop(entry);
      this.deps.onAutoDisabled(pluginId, entry.error);
    }
    this.notify();
  }

  log(entry: PluginEntry, level: PluginLogEntry['level'], message: string): void {
    entry.logs.push({ level, message: message.slice(0, 1_000), at: this.now() });
    if (entry.logs.length > PLUGIN_HOST_LIMITS.logEntries)
      entry.logs.splice(0, entry.logs.length - PLUGIN_HOST_LIMITS.logEntries);
  }

  getLogs(pluginId: string): readonly PluginLogEntry[] {
    return this.entries.get(pluginId)?.logs ?? [];
  }

  messages(pluginId: string): Readonly<Record<string, string>> | undefined {
    const entry = this.entries.get(pluginId);
    return entry ? pickMessages(entry.plugin, this.deps.hostInfo().locale) : undefined;
  }

  localize(pluginId: string, text: string): string {
    return localizeManifestText(text, this.messages(pluginId));
  }

  onStorageChange(pluginId: string, key: string, listener: () => void): () => void {
    const id = `${pluginId}\u0000${key}`;
    const listeners = this.storageListeners.get(id) ?? new Set();
    listeners.add(listener);
    this.storageListeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.storageListeners.delete(id);
    };
  }

  emitStorageChange(pluginId: string, key: string): void {
    for (const listener of [...(this.storageListeners.get(`${pluginId}\u0000${key}`) ?? [])]) listener();
  }

  /** Throws when the plugin's manifest does not declare the permission. */
  assertPermission(entry: PluginEntry, permission: string): void {
    if (!entry.plugin.manifest.permissions.some((item) => item.name === permission)) {
      throw new LunarPluginError('PERMISSION_DENIED', `The manifest does not declare ${permission}`);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new LunarPluginError('TIMEOUT', message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
