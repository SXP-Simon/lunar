import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseIntegrityManifest, verifyPackageIntegrity } from '@lunar/plugin-sdk/package-format';
import { buildPlugin, BuildError } from '../src/build.ts';
import { startDevServer } from '../src/dev-server.ts';
import { initProject } from '../src/init.ts';
import { packPlugin, sha256 } from '../src/pack.ts';
import { loadProject, ProjectError } from '../src/project.ts';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'lunar-plugin-'));
  await initProject(path.join(directory, 'plugin'), { id: 'org.example.hello', name: '你好' });
  directory = path.join(directory, 'plugin');
});

afterEach(async () => {
  await rm(path.dirname(directory), { recursive: true, force: true });
});

async function writeSource(source: string) {
  await writeFile(path.join(directory, 'src/index.tsx'), source);
}

describe('plugin build', () => {
  it('bundles the scaffold and keeps host modules external', async () => {
    const result = await buildPlugin(await loadProject(directory));
    const code = new TextDecoder().decode(result.code);
    expect(code).toContain('require("@lunar/plugin-sdk")');
    expect(code).toContain('require("@lunar/plugin-sdk/ui")');
    expect(code).toContain('require("react/jsx-runtime")');
    expect(code).not.toContain('jsxDEV');
  });

  it.each([
    ['import "expo-file-system";', 'contains native modules'],
    ['import fs from "node:fs"; void fs;', 'Node.js built-in module'],
    ['import { Button } from "heroui-native/button"; void Button;', 'use @lunar/plugin-sdk/ui'],
    ['import { parsePluginManifest } from "@lunar/plugin-sdk/manifest"; void parsePluginManifest;', 'host tooling'],
    ['export const run = () => import("./other");', 'Dynamic import'],
    ['export const View = () => <view className="p-4" />;', 'className has no effect'],
    ["export function f() { 'worklet'; return 1; }", 'Worklets are not supported'],
  ])('rejects %s', async (source, message) => {
    await writeSource(source);
    await expect(buildPlugin(await loadProject(directory))).rejects.toThrow(message);
    await expect(buildPlugin(await loadProject(directory))).rejects.toBeInstanceOf(BuildError);
  });

  it('reports a locale that misses a manifest key', async () => {
    await writeFile(path.join(directory, 'locales/en.json'), JSON.stringify({ name: 'Hello' }));
    await expect(loadProject(directory)).rejects.toBeInstanceOf(ProjectError);
    await expect(loadProject(directory)).rejects.toThrow('locales/en.json: missing "description"');
  });
});

describe('plugin pack', () => {
  it('writes a package whose integrity manifest covers every file', async () => {
    const result = await packPlugin(await loadProject(directory));
    expect(path.basename(result.file)).toBe('org.example.hello-0.1.0.lunar-plugin');
    const archive = new Uint8Array(await readFile(result.file));
    expect(sha256(archive)).toBe(result.sha256);
    const files = new Map(Object.entries(unzipSync(archive)));
    expect([...files.keys()].sort()).toEqual([
      'integrity.json',
      'locales/en.json',
      'locales/zh-CN.json',
      'main.js',
      'manifest.json',
    ]);
    const integrity = parseIntegrityManifest(new TextDecoder().decode(files.get('integrity.json')));
    expect(integrity).toBeDefined();
    expect(await verifyPackageIntegrity(files, integrity!, sha256)).toEqual([]);
  });

  it('produces identical archives for identical inputs', async () => {
    const first = await packPlugin(await loadProject(directory));
    const second = await packPlugin(await loadProject(directory));
    expect(second.sha256).toBe(first.sha256);
  });
});

describe('plugin dev server', () => {
  it('serves the latest build only with the pairing token', async () => {
    const server = await startDevServer(directory, { port: 0, host: '127.0.0.1' });
    try {
      const base = new URL(server.urls[0]);
      const withToken = (pathname: string) => `${base.origin}${pathname}?token=${server.token}`;
      expect((await fetch(`${base.origin}/main.js`)).status).toBe(403);
      let revision = 0;
      for (let attempt = 0; attempt < 50 && revision === 0; attempt += 1) {
        revision = ((await (await fetch(withToken('/version'))).json()) as { revision: number }).revision;
        if (revision === 0) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(revision).toBeGreaterThan(0);
      expect(await (await fetch(withToken('/main.js'))).text()).toContain('require("@lunar/plugin-sdk")');
      expect(JSON.parse(await (await fetch(withToken('/manifest.json'))).text()).id).toBe('org.example.hello');
      expect(((await (await fetch(withToken('/locales/zh-CN.json'))).json()) as Record<string, string>).name).toBe(
        '你好',
      );
    } finally {
      await server.close();
    }
  });
});
