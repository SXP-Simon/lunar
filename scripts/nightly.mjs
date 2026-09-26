import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { githubClient, publish, validateApk, validateVersion } from './release.mjs';

export function nightlyRelease(tag) {
  if (!/^nightly-\d{8}-[1-9]\d*$/.test(tag ?? '')) throw new Error('Invalid nightly tag.');
  return { tag, prerelease: true, name: `Lunar ${tag}` };
}

export async function nightlyAssets(root, commit, version, packageName) {
  const assets = [];
  const manifests = [];
  for (const profile of ['nightly', 'development']) {
    const file = `lunar-${profile}.apk`;
    const data = await readFile(resolve(root, file));
    const metadata = JSON.parse(await readFile(resolve(root, `${profile}.json`), 'utf8'));
    const sha256 = createHash('sha256').update(data).digest('hex');
    const expectedPackage = `${packageName}.${profile === 'nightly' ? 'nightly' : 'dev'}`;
    if (
      !data.length ||
      metadata.profile !== profile ||
      metadata.commit !== commit ||
      metadata.sha256 !== sha256 ||
      metadata.packageName !== expectedPackage ||
      metadata.version !== version ||
      metadata.abi !== 'arm64-v8a'
    ) {
      throw new Error(`Invalid ${profile} artifact metadata.`);
    }
    // Use the product name Develop in public downloads; EAS keeps its development profile name.
    const name = profile === 'development' ? 'lunar-develop.apk' : file;
    assets.push({ name, data, contentType: 'application/vnd.android.package-archive' });
    manifests.push({ ...metadata, artifact: name });
  }
  assets.push({
    name: 'SHA256SUMS.txt',
    contentType: 'text/plain',
    data: Buffer.from(manifests.map((item) => `${item.sha256}  ${item.artifact}\n`).join('')),
  });
  assets.push({
    name: 'nightly.json',
    contentType: 'application/json',
    data: Buffer.from(`${JSON.stringify({ commit, builds: manifests }, null, 2)}\n`),
  });
  return assets;
}

async function main() {
  const [command, profile] = process.argv.slice(2);
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const { expo } = JSON.parse(await readFile('app.json', 'utf8'));
  validateVersion(`v${pkg.version}`, pkg.version, expo.version);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (command === 'prepare') {
    if (!['nightly', 'development'].includes(profile)) throw new Error('Invalid nightly build profile.');
    const apk = `artifacts/lunar-${profile}.apk`;
    const badging = execFileSync(
      resolve(process.env.ANDROID_HOME, 'build-tools/36.0.0/aapt'),
      ['dump', 'badging', apk],
      { encoding: 'utf8' },
    );
    const packageName = `${expo.android.package}.${profile === 'nightly' ? 'nightly' : 'dev'}`;
    const android = validateApk(badging, pkg.version, packageName, { allowDebuggable: profile === 'development' });
    const sha256 = createHash('sha256')
      .update(await readFile(apk))
      .digest('hex');
    await writeFile(
      `artifacts/${profile}.json`,
      `${JSON.stringify({ profile, commit, version: pkg.version, sha256, ...android }, null, 2)}\n`,
    );
    return;
  }
  if (command !== 'publish') throw new Error('Usage: node scripts/nightly.mjs <prepare profile|publish>');
  const release = nightlyRelease(process.env.NIGHTLY_TAG);
  const repository = process.env.LUNAR_GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository.');
  const assets = await nightlyAssets('artifacts', commit, pkg.version, expo.android.package);
  const api = githubClient(process.env.GITHUB_TOKEN);
  // List refs to handle reruns without replacing an existing tag.
  const refs = await api('GET', `/repos/${repository}/git/matching-refs/tags/${release.tag}`);
  if (!refs.some((ref) => ref.ref === `refs/tags/${release.tag}`)) {
    await api('POST', `/repos/${repository}/git/refs`, { ref: `refs/tags/${release.tag}`, sha: commit });
  }
  const notes = [
    '## 中文',
    '此预发布包含同一提交编译的两个 Android arm64 APK。',
    '`lunar-nightly.apk`：内置应用代码，安装后可独立运行，使用独立的 Nightly 应用存储。',
    '`lunar-develop.apk`：Expo 开发客户端，需要从同一提交启动 Metro 开发服务器。',
    '## English',
    'Both Android arm64 APKs are built from the same commit.',
    '`lunar-nightly.apk`: standalone app with bundled JavaScript and separate Nightly storage.',
    '`lunar-develop.apk`: Expo development client; requires Metro running from this source commit.',
    '```sh\nAPP_VARIANT=development pnpm start --dev-client\n```',
  ].join('\n\n');
  const result = await publish(api, repository, release, commit, assets, notes);
  console.log(`Published ${result.html_url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
