import { isExternalPluginPackage, readExternalPluginPackage } from '../infrastructure/external-plugin-package';
import type { PickedPluginPackage } from '../infrastructure/expo-plugin-files';

const requests = new Map<string, Promise<PickedPluginPackage>>();
let sequence = 0;

/**
 * Claims system file-open requests for `.lunar-plugin` packages and routes them
 * to the plugin tab. Returns `undefined` for every other path.
 */
export async function redirectExternalPluginPackage({ path }: { path: string }): Promise<string | undefined> {
  if (!(await isExternalPluginPackage(path))) return undefined;
  const requestId = String(++sequence);
  const read = readExternalPluginPackage(path);
  // The screen reports failures; keep an unconsumed rejection from surfacing globally.
  read.catch(() => undefined);
  requests.set(requestId, read);
  return `/plugins?install=${requestId}`;
}

/** Hands an opened package to the install flow once; later calls return `undefined`. */
export function takeExternalPluginPackage(requestId: string): Promise<PickedPluginPackage> | undefined {
  const request = requests.get(requestId);
  requests.delete(requestId);
  return request;
}
