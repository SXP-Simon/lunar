import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createIntegrityManifest,
  findPathCollisions,
  parseIntegrityManifest,
  PACKAGE_LIMITS,
  serializeIntegrityManifest,
  validatePackageIcon,
  validatePackagePath,
  verifyPackageIntegrity,
} from '../src/package-format';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytes = (text: string) => new TextEncoder().encode(text);

describe('package paths', () => {
  it('accepts nested relative paths', () => {
    expect(validatePackagePath('locales/zh-CN.json')).toBeUndefined();
  });

  it.each(['/etc/passwd', 'C:/x', '../x', 'a/../b', 'a//b', 'a\\b', './a', 'a/b/c/d/e/f/g/h/i', 'a\u0000'])(
    'rejects %j',
    (path) => {
      expect(validatePackagePath(path)).toBeDefined();
    },
  );

  it('reports case and normalization collisions', () => {
    expect(findPathCollisions(['main.js', 'Main.js', 'caf\u00e9', 'cafe\u0301'])).toHaveLength(2);
  });
});

describe('integrity manifest', () => {
  const files = new Map([
    ['manifest.json', bytes('{}')],
    ['main.js', bytes('module.exports = {}')],
  ]);

  it('round-trips through its canonical form and verifies matching files', async () => {
    const manifest = await createIntegrityManifest(
      [...files].map(([path, data]) => ({ path, bytes: data })),
      sha256,
    );
    const text = serializeIntegrityManifest(manifest);
    expect(manifest.files.map((entry) => entry.path)).toEqual(['main.js', 'manifest.json']);
    expect(serializeIntegrityManifest(parseIntegrityManifest(text)!)).toBe(text);
    const all = new Map(files).set('integrity.json', bytes(text));
    expect(await verifyPackageIntegrity(all, parseIntegrityManifest(text)!, sha256)).toEqual([]);
  });

  it('reports tampered, unlisted and missing files', async () => {
    const manifest = await createIntegrityManifest(
      [...files].map(([path, data]) => ({ path, bytes: data })),
      sha256,
    );
    const tampered = new Map([
      ['main.js', bytes('module.exports = { evil: true }')],
      ['extra.js', bytes('')],
    ]);
    const problems = await verifyPackageIntegrity(tampered, manifest, sha256);
    expect(problems).toEqual([
      'main.js size does not match',
      'extra.js is not listed in integrity.json',
      'manifest.json is listed but missing',
    ]);
  });

  it('rejects malformed manifests', () => {
    expect(parseIntegrityManifest('nope')).toBeUndefined();
    expect(
      parseIntegrityManifest('{"format":1,"algorithm":"sha256","files":[{"path":"a","size":1,"sha256":"x"}]}'),
    ).toBeUndefined();
  });
});

describe('package icons', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

  it('accepts a PNG within the size limit', () => {
    expect(validatePackageIcon(png)).toBeUndefined();
  });

  it('rejects missing, oversized and non-PNG files', () => {
    expect(validatePackageIcon(undefined)).toBe('file is missing');
    expect(validatePackageIcon(bytes('<svg/>'))).toBe('file is not a PNG image');
    const large = new Uint8Array(PACKAGE_LIMITS.iconBytes + 1);
    large.set(png);
    expect(validatePackageIcon(large)).toMatch(/exceeds/);
  });
});
