import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { nightlyAssets, nightlyRelease } from '../../scripts/nightly.mjs';
import { validateApk } from '../../scripts/release.mjs';

test('nightly tags are prereleases with a run-specific identity', () => {
  assert.equal(nightlyRelease('nightly-20260926-123').prerelease, true);
  for (const tag of ['dev-latest', 'v1.0.0', 'nightly-20260926-0', '../nightly']) {
    assert.throws(() => nightlyRelease(tag), /Invalid/);
  }
});

test('development APK validation permits debug mode only with an explicit option', () => {
  const badging =
    "package: name='com.lunar.dev' versionCode='42' versionName='1.0.0'\nnative-code: 'arm64-v8a'\napplication-debuggable\n";
  assert.throws(() => validateApk(badging, '1.0.0', 'com.lunar.dev'), /debuggable/);
  assert.equal(validateApk(badging, '1.0.0', 'com.lunar.dev', { allowDebuggable: true }).versionCode, 42);
});

test('requires both APKs from the same commit and verifies identity and hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lunar-nightly-'));
  const commit = 'a'.repeat(40);
  const metadata = {};
  try {
    for (const profile of ['nightly', 'development']) {
      const data = Buffer.from(profile);
      metadata[profile] = {
        profile,
        commit,
        version: '1.0.0',
        abi: 'arm64-v8a',
        packageName: `com.lunar.${profile === 'nightly' ? 'nightly' : 'dev'}`,
        sha256: createHash('sha256').update(data).digest('hex'),
      };
      await writeFile(join(root, `lunar-${profile}.apk`), data);
      await writeFile(join(root, `${profile}.json`), JSON.stringify(metadata[profile]));
    }
    const assets = await nightlyAssets(root, commit, '1.0.0', 'com.lunar');
    assert.deepEqual(
      assets.map((asset) => asset.name),
      ['lunar-nightly.apk', 'lunar-develop.apk', 'SHA256SUMS.txt', 'nightly.json'],
    );
    assert.equal(assets[2].data.toString().trim().split('\n').length, 2);
    for (const field of ['commit', 'sha256', 'packageName', 'version', 'abi', 'profile']) {
      await writeFile(
        join(root, 'development.json'),
        JSON.stringify({ ...metadata.development, [field]: 'incorrect' }),
      );
      await assert.rejects(nightlyAssets(root, commit, '1.0.0', 'com.lunar'), /Invalid development/);
    }
    await rm(join(root, 'lunar-development.apk'));
    await assert.rejects(nightlyAssets(root, commit, '1.0.0', 'com.lunar'), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
