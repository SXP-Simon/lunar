import type { NetworkRequest, NetworkResponse } from '@lunar/plugin-sdk';
import { LunarPluginError } from '../domain/plugin-error';

export const NETWORK_LIMITS = {
  timeoutMs: 30_000,
  responseCharacters: 2 * 1024 * 1024,
  requestBodyCharacters: 1024 * 1024,
  concurrentRequests: 4,
} as const;

const ForbiddenHeaders = new Set([
  'host',
  'cookie',
  'cookie2',
  'origin',
  'referer',
  'connection',
  'content-length',
  'transfer-encoding',
  'proxy-authorization',
]);

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Checks a request against the plugin's granted HTTPS origins. Name resolution
 * happens in the platform network stack, so addresses are checked as written;
 * literal private and loopback hosts are refused.
 */
export function assertRequestAllowed(request: NetworkRequest, origins: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new LunarPluginError('INVALID_ARGUMENT', 'The request URL is invalid');
  }
  if (url.protocol !== 'https:') throw new LunarPluginError('NETWORK_DENIED', 'Only HTTPS requests are allowed');
  if (url.username || url.password) throw new LunarPluginError('NETWORK_DENIED', 'URLs must not embed credentials');
  if (isPrivateHost(url.hostname)) throw new LunarPluginError('NETWORK_DENIED', 'Local network hosts are not allowed');
  if (!origins.includes(url.origin)) {
    throw new LunarPluginError('NETWORK_DENIED', `${url.origin} is not among the plugin's network permissions`);
  }
  return url;
}

export function createPluginNetwork(fetchImpl: FetchLike) {
  const active = new Map<string, number>();

  return async function request(
    pluginId: string,
    origins: readonly string[],
    request: NetworkRequest,
    lifetime: AbortSignal,
  ): Promise<NetworkResponse> {
    const url = assertRequestAllowed(request, origins);
    const method = request.method ?? 'GET';
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
      throw new LunarPluginError('INVALID_ARGUMENT', `Method ${String(method)} is not supported`);
    }
    if (request.body !== undefined && request.body.length > NETWORK_LIMITS.requestBodyCharacters) {
      throw new LunarPluginError('QUOTA_EXCEEDED', 'The request body is too large');
    }
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      if (ForbiddenHeaders.has(name.toLowerCase()) || name.toLowerCase().startsWith('sec-')) {
        throw new LunarPluginError('INVALID_ARGUMENT', `Header ${name} cannot be set by plugins`);
      }
      headers[name] = String(value);
    }
    if ((active.get(pluginId) ?? 0) >= NETWORK_LIMITS.concurrentRequests) {
      throw new LunarPluginError('QUOTA_EXCEEDED', 'Too many concurrent requests');
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(
      abort,
      Math.min(request.timeoutMs ?? NETWORK_LIMITS.timeoutMs, NETWORK_LIMITS.timeoutMs),
    );
    lifetime.addEventListener('abort', abort);
    request.signal?.addEventListener('abort', abort);
    active.set(pluginId, (active.get(pluginId) ?? 0) + 1);
    try {
      const response = await fetchImpl(url.href, {
        method,
        headers,
        body: request.body,
        signal: controller.signal,
        credentials: 'omit',
      });
      // React Native follows redirects itself; a response from another origin is withheld.
      if (response.url && new URL(response.url).origin !== url.origin) {
        throw new LunarPluginError('NETWORK_DENIED', 'The request was redirected to another origin');
      }
      const body = await response.text();
      if (body.length > NETWORK_LIMITS.responseCharacters) {
        throw new LunarPluginError('QUOTA_EXCEEDED', 'The response is too large');
      }
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'set-cookie') responseHeaders[name.toLowerCase()] = value;
      });
      return {
        status: response.status,
        headers: responseHeaders,
        body,
        json<T>() {
          try {
            return JSON.parse(body) as T;
          } catch {
            throw new LunarPluginError('INVALID_ARGUMENT', 'The response is not valid JSON');
          }
        },
      };
    } catch (error) {
      if (error instanceof LunarPluginError) throw error;
      if (controller.signal.aborted) {
        throw request.signal?.aborted || lifetime.aborted
          ? new LunarPluginError('CANCELLED', 'The request was cancelled')
          : new LunarPluginError('TIMEOUT', 'The request timed out');
      }
      throw new LunarPluginError('NETWORK_DENIED', 'The request failed', true);
    } finally {
      clearTimeout(timeout);
      lifetime.removeEventListener('abort', abort);
      request.signal?.removeEventListener('abort', abort);
      active.set(pluginId, (active.get(pluginId) ?? 1) - 1);
    }
  };
}

export type PluginNetwork = ReturnType<typeof createPluginNetwork>;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (host.includes(':')) {
    return (
      host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')
    );
  }
  return false;
}
