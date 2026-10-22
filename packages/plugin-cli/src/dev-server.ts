import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import * as esbuild from 'esbuild';
import { createBuildOptions, toBuildResult, BuildError } from './build.ts';
import { loadProject, type PluginProject } from './project.ts';

export interface DevServerOptions {
  readonly port: number;
  readonly host: string;
  readonly onEvent?: (message: string) => void;
  /** Receives formatted log lines of the plugin running in the app. */
  readonly onLog?: (line: string) => void;
}

export interface DevServer {
  readonly urls: readonly string[];
  readonly token: string;
  close(): Promise<void>;
}

interface DevState {
  project: PluginProject;
  code?: Uint8Array;
  error?: string;
  revision: number;
}

/**
 * Serves the latest build to a Lunar development build on the local network.
 * Every request must carry the one-time pairing token printed at start-up.
 */
export async function startDevServer(directory: string, options: DevServerOptions): Promise<DevServer> {
  const token = randomBytes(16).toString('hex');
  const state: DevState = { project: await loadProject(directory), revision: 0 };
  const log = options.onEvent ?? (() => undefined);

  const context = await esbuild.context({
    ...createBuildOptions(state.project),
    plugins: [
      ...(createBuildOptions(state.project).plugins ?? []),
      {
        name: 'lunar-dev-reload',
        setup(build) {
          build.onEnd(async (result) => {
            try {
              // Manifest and locale edits take effect with the next rebuild.
              state.project = await loadProject(directory);
              state.code = toBuildResult(result).code;
              state.error = undefined;
              log(`rebuilt revision ${state.revision + 1}`);
            } catch (error) {
              state.error = error instanceof BuildError || error instanceof Error ? error.message : String(error);
              log(state.error);
            }
            state.revision += 1;
          });
        },
      },
    ],
  });
  await context.watch();

  const appLog = options.onLog ?? (() => undefined);
  const server = createServer((request, response) => handle(request, response, state, token, appLog));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    token,
    urls: lanAddresses(options.host).map((host) => `http://${host}:${port}/?token=${token}`),
    async close() {
      await context.dispose();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const MaxLogBodyBytes = 256 * 1024;

function handle(
  request: IncomingMessage,
  response: ServerResponse,
  state: DevState,
  token: string,
  log: (message: string) => void,
) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.searchParams.get('token') !== token) return send(response, 403, 'text/plain', 'Invalid pairing token');
  if (request.method === 'POST' && url.pathname === '/logs') return receiveLogs(request, response, log);
  if (request.method !== 'GET') return send(response, 405, 'text/plain', 'Method not allowed');

  if (url.pathname === '/version') {
    return send(response, 200, 'application/json', JSON.stringify({ revision: state.revision, error: state.error }));
  }
  if (url.pathname === '/manifest.json') return send(response, 200, 'application/json', state.project.manifestText);
  if (url.pathname === '/main.js') {
    if (!state.code) return send(response, 503, 'text/plain', state.error ?? 'The first build has not finished');
    return send(response, 200, 'text/javascript', state.code);
  }
  const locale = /^\/locales\/([^/]+)\.json$/.exec(url.pathname)?.[1];
  if (locale) {
    const messages = state.project.locales.get(locale);
    return messages
      ? send(response, 200, 'application/json', JSON.stringify(messages))
      : send(response, 404, 'text/plain', 'No such locale');
  }
  return send(response, 404, 'text/plain', 'Not found');
}

/** Prints log entries the app sends from the running development plugin. */
function receiveLogs(request: IncomingMessage, response: ServerResponse, log: (message: string) => void) {
  const chunks: Buffer[] = [];
  let size = 0;
  request.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MaxLogBodyBytes) {
      send(response, 413, 'text/plain', 'Too many log entries');
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (response.writableEnded) return;
    let entries: unknown;
    try {
      entries = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { entries?: unknown }).entries;
    } catch {
      return send(response, 400, 'text/plain', 'Invalid log batch');
    }
    if (!Array.isArray(entries)) return send(response, 400, 'text/plain', 'Invalid log batch');
    for (const entry of entries) {
      const line = formatLogEntry(entry);
      if (line) log(line);
    }
    send(response, 204, 'text/plain', '');
  });
}

export function formatLogEntry(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const { level, message, at } = entry as { level?: unknown; message?: unknown; at?: unknown };
  if (typeof message !== 'string') return undefined;
  const label = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN ' : 'INFO ';
  const time = typeof at === 'number' ? new Date(at).toTimeString().slice(0, 8) : '--:--:--';
  return `${time} ${label} ${message}`;
}

function send(response: ServerResponse, status: number, type: string, body: string | Uint8Array) {
  response.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  response.end(body);
}

function lanAddresses(host: string): string[] {
  if (host !== '0.0.0.0' && host !== '::') return [host];
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => item!.address);
  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}
