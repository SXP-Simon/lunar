import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  githubClient,
  preflight,
  publish as publishRelease,
  readChangelog,
  validateApk,
  validateVersion,
} from '../../scripts/release.mjs';

const notes = '## 中文\n\n版本更新。\n\n## English\n\nRelease changes.';
const publish = (...args) => publishRelease(...args, notes);

const commit = 'a'.repeat(40);
const release = { tag: 'v1.0.0', version: '1.0.0', prerelease: false };
const apk = {
  name: 'lunar-v1.0.0-android-arm64-v8a.apk',
  data: Buffer.from('apk'),
  contentType: 'application/octet-stream',
};

function fixture({ existing, remoteCommit = commit, annotated = false, failUpload = false, shortUpload = false } = {}) {
  const calls = [];
  let draft = existing;
  const api = async (method, endpoint, body) => {
    calls.push({ method, endpoint, body });
    if (endpoint.includes('/git/ref/')) return { object: { type: annotated ? 'tag' : 'commit', sha: remoteCommit } };
    if (endpoint.includes('/git/tags/')) return { object: { type: 'commit', sha: remoteCommit } };
    if (method === 'GET' && endpoint.includes('/releases?')) return draft ? [draft] : [];
    if (method === 'POST' && endpoint.endsWith('/releases')) {
      draft = {
        id: 1,
        ...body,
        assets: [],
        upload_url: 'https://uploads.github.com/repos/owner/repo/releases/1/assets{?name,label}',
      };
      return draft;
    }
    if (endpoint.startsWith('https://uploads.github.com')) {
      if (failUpload) throw new Error('Upload failed');
      return { state: 'uploaded', size: shortUpload ? 0 : body.length };
    }
    if (method === 'DELETE') return undefined;
    if (method === 'PATCH') return { html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0' };
    throw new Error(`Unexpected request: ${method} ${endpoint}`);
  };
  return { api, calls };
}

test('validates stable and preview tags against both version files', () => {
  assert.deepEqual(validateVersion('v1.0.0', '1.0.0', '1.0.0'), release);
  assert.equal(validateVersion('v1.0.0-rc.1', '1.0.0', '1.0.0').prerelease, true);
  for (const tag of ['main', 'v01.0.0', 'v1.0.0-rc.0', 'v1.0.0;echo token', '../v1.0.0']) {
    assert.throws(() => validateVersion(tag, '1.0.0', '1.0.0'));
  }
  assert.throws(() => validateVersion('v1.0.1', '1.0.0', '1.0.1'), /requires/);
  assert.throws(() => validateVersion('v1.0.1', '1.0.1', '1.0.0'), /requires/);
});

test('rejects incorrect APK identity, ABI and development builds', () => {
  const badging =
    "package: name='com.lunarain_079.lunar' versionCode='42' versionName='1.0.0'\nnative-code: 'arm64-v8a'\n";
  assert.equal(validateApk(badging, '1.0.0', 'com.lunarain_079.lunar').versionCode, 42);
  assert.throws(() => validateApk(badging, '1.0.1', 'com.lunarain_079.lunar'), /version/);
  assert.throws(() => validateApk(badging, '1.0.0', 'com.example.other'), /package/);
  assert.throws(
    () => validateApk(badging.replace("'arm64-v8a'", "'x86_64'"), '1.0.0', 'com.lunarain_079.lunar'),
    /ABI/,
  );
  assert.throws(
    () => validateApk(`${badging}application-debuggable\n`, '1.0.0', 'com.lunarain_079.lunar'),
    /debuggable/,
  );
});

test('resolves annotated GitHub tags and rejects a different commit before mutation', async () => {
  await preflight(fixture({ annotated: true }).api, 'owner/repo', release, commit);
  const { api, calls } = fixture({ remoteCommit: 'b'.repeat(40) });
  await assert.rejects(publish(api, 'owner/repo', release, commit, [apk]), /same commit/);
  assert.ok(calls.every((call) => call.method === 'GET'));
});

test('publishes only after every artifact upload succeeds', async () => {
  const { api, calls } = fixture();
  await publish(api, 'owner/repo', release, commit, [apk, { ...apk, name: 'SHA256SUMS.txt' }]);
  assert.equal(calls.filter((call) => call.endpoint.startsWith('https://uploads.github.com')).length, 2);
  assert.deepEqual(calls.at(-1).body, {
    body: `<!-- lunar-release:${commit} -->\n${notes}\n\nSource commit: ${commit}`,
    draft: false,
    prerelease: false,
    make_latest: 'legacy',
  });
  assert.equal(calls.find((call) => call.method === 'POST' && call.endpoint.endsWith('/releases')).body.draft, true);
});

test('failed or incomplete uploads leave the release draft unpublished', async () => {
  for (const options of [{ failUpload: true }, { shortUpload: true }]) {
    const { api, calls } = fixture(options);
    await assert.rejects(publish(api, 'owner/repo', release, commit, [apk]));
    assert.ok(calls.every((call) => call.method !== 'PATCH'));
  }
});

test('keeps the draft private if the tag changes during upload', async () => {
  const fixtureApi = fixture();
  let tagReads = 0;
  const api = async (method, endpoint, body) => {
    if (endpoint.includes('/git/ref/') && ++tagReads > 1) {
      return { object: { type: 'commit', sha: 'b'.repeat(40) } };
    }
    return fixtureApi.api(method, endpoint, body);
  };
  await assert.rejects(publish(api, 'owner/repo', release, commit, [apk]), /same commit/);
  assert.ok(fixtureApi.calls.every((call) => call.method !== 'PATCH'));
});

test('refuses to overwrite published releases and unrelated drafts', async () => {
  for (const existing of [
    { tag_name: release.tag, draft: false },
    { tag_name: release.tag, draft: true, body: 'Manual release' },
  ]) {
    const { api, calls } = fixture({ existing });
    await assert.rejects(publish(api, 'owner/repo', release, commit, [apk]), /published or managed elsewhere/);
    assert.ok(calls.every((call) => call.method === 'GET'));
  }
});

test('resumes its own draft and marks release candidates as prereleases', async () => {
  const preview = { ...release, tag: 'v1.0.0-rc.1', prerelease: true };
  const { api, calls } = fixture({
    existing: {
      id: 1,
      tag_name: preview.tag,
      draft: true,
      body: `<!-- lunar-release:${commit} -->`,
      assets: [{ id: 2, name: apk.name }],
      upload_url: 'https://uploads.github.com/repos/owner/repo/releases/1/assets{?name,label}',
    },
  });
  await publish(api, 'owner/repo', preview, commit, [apk]);
  assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
  assert.equal(calls.at(-1).body.prerelease, true);
  assert.equal(calls.at(-1).body.make_latest, 'false');
});

test('requires a token and refuses to send it to another host', async () => {
  assert.throws(() => githubClient(''), /required/);
  await assert.rejects(githubClient('test-token')('GET', 'https://example.com'), /host/);
});

test('requires both completed language files from the exact tag directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lunar-changelog-'));
  try {
    const directory = join(root, 'v1.0.0-rc.1');
    await mkdir(directory);
    await writeFile(join(directory, 'zh-CN.md'), '中文更新');
    await assert.rejects(readChangelog('v1.0.0-rc.1', root), /ENOENT/);
    await writeFile(join(directory, 'en-US.md'), 'English changes');
    assert.equal(await readChangelog('v1.0.0-rc.1', root), '## 中文\n\n中文更新\n\n## English\n\nEnglish changes');
    await assert.rejects(readChangelog('v1.0.0', root), /ENOENT/);
    for (const content of ['', 'TODO', 'TBD', '待填写']) {
      await writeFile(join(directory, 'en-US.md'), content);
      await assert.rejects(readChangelog('v1.0.0-rc.1', root), /Complete changelog/);
    }
    await assert.rejects(readChangelog('../../secret', root), /Invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('publishes supplied notes without generating commit notes', async () => {
  const { api, calls } = fixture();
  await assert.rejects(publishRelease(api, 'owner/repo', release, commit, [apk], ''), /notes are required/);
  assert.equal(calls.length, 0);
  await publish(api, 'owner/repo', release, commit, [apk]);
  const created = calls.find((call) => call.method === 'POST' && call.endpoint.endsWith('/releases'));
  assert.equal(created.body.generate_release_notes, false);
  assert.ok(created.body.body.includes(notes));
});
