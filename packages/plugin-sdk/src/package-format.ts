// Shared by the Lunar host and the plugin CLI. Keep this module free of
// runtime imports: Node runs the CLI from TypeScript source directly.

export const PACKAGE_EXTENSION = '.lunar-plugin';
export const INTEGRITY_FILE = 'integrity.json';
export const SIGNATURE_FILE = 'signature.json';
export const ENTRY_FILE = 'main.js';
export const LOCALES_DIRECTORY = 'locales';

export const PACKAGE_LIMITS = {
  archiveBytes: 10 * 1024 * 1024,
  expandedBytes: 30 * 1024 * 1024,
  entryFileBytes: 2 * 1024 * 1024,
  fileBytes: 8 * 1024 * 1024,
  entries: 500,
  depth: 8,
} as const;

export interface IntegrityEntry {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface IntegrityManifest {
  readonly format: 1;
  readonly algorithm: 'sha256';
  readonly files: readonly IntegrityEntry[];
}

export type Sha256 = (bytes: Uint8Array) => string | Promise<string>;

/** Returns why a package path is unacceptable, or `undefined` for a safe relative path. */
export function validatePackagePath(path: string): string | undefined {
  if (path.length === 0 || path.length > 200) return 'path length is out of range';
  if (path.includes('\\')) return 'path uses a backslash';
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return 'path is absolute';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return 'path contains a control character';
  const segments = path.split('/');
  if (segments.length > PACKAGE_LIMITS.depth) return 'path is nested too deeply';
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'path contains an empty or relative segment';
  }
  return undefined;
}

/** Paths that collide on case-insensitive or Unicode-normalising file systems. */
export function findPathCollisions(paths: readonly string[]): readonly string[] {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const path of paths) {
    const folded = path.normalize('NFC').toLowerCase();
    const previous = seen.get(folded);
    if (previous !== undefined) collisions.push(previous === path ? path : `${previous} / ${path}`);
    else seen.set(folded, path);
  }
  return collisions;
}

export function isIntegrityExempt(path: string): boolean {
  return path === INTEGRITY_FILE || path === SIGNATURE_FILE;
}

export async function createIntegrityManifest(
  files: readonly { readonly path: string; readonly bytes: Uint8Array }[],
  sha256: Sha256,
): Promise<IntegrityManifest> {
  const entries: IntegrityEntry[] = [];
  for (const file of files) {
    if (isIntegrityExempt(file.path)) continue;
    entries.push({ path: file.path, size: file.bytes.byteLength, sha256: (await sha256(file.bytes)).toLowerCase() });
  }
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return { format: 1, algorithm: 'sha256', files: entries };
}

/** Canonical bytes: sorted entries, fixed key order, two-space indentation and a final newline. */
export function serializeIntegrityManifest(manifest: IntegrityManifest): string {
  const files = [...manifest.files]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((entry) => ({ path: entry.path, size: entry.size, sha256: entry.sha256 }));
  return `${JSON.stringify({ format: manifest.format, algorithm: manifest.algorithm, files }, null, 2)}\n`;
}

export function parseIntegrityManifest(text: string): IntegrityManifest | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.format !== 1 || value.algorithm !== 'sha256' || !Array.isArray(value.files)) {
    return undefined;
  }
  const files: IntegrityEntry[] = [];
  for (const entry of value.files) {
    if (
      !isRecord(entry) ||
      typeof entry.path !== 'string' ||
      typeof entry.size !== 'number' ||
      !Number.isInteger(entry.size) ||
      entry.size < 0 ||
      typeof entry.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) {
      return undefined;
    }
    files.push({ path: entry.path, size: entry.size, sha256: entry.sha256 });
  }
  return { format: 1, algorithm: 'sha256', files };
}

/** Every file except the integrity and signature files must be listed with a matching size and digest. */
export async function verifyPackageIntegrity(
  files: ReadonlyMap<string, Uint8Array>,
  manifest: IntegrityManifest,
  sha256: Sha256,
): Promise<readonly string[]> {
  const problems: string[] = [];
  const listed = new Map(manifest.files.map((entry) => [entry.path, entry]));
  if (listed.size !== manifest.files.length) problems.push('integrity manifest lists a file twice');
  for (const [path, bytes] of files) {
    if (isIntegrityExempt(path)) continue;
    const entry = listed.get(path);
    if (!entry) {
      problems.push(`${path} is not listed in ${INTEGRITY_FILE}`);
      continue;
    }
    listed.delete(path);
    if (entry.size !== bytes.byteLength) {
      problems.push(`${path} size does not match`);
      continue;
    }
    if ((await sha256(bytes)).toLowerCase() !== entry.sha256) problems.push(`${path} digest does not match`);
  }
  for (const path of listed.keys()) problems.push(`${path} is listed but missing`);
  return problems;
}

export function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0');
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
