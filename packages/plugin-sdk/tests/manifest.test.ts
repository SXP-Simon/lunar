import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  localizeManifestText,
  networkOrigins,
  parsePluginManifest,
  satisfiesVersionRange,
} from '../src/manifest';

const valid = {
  manifestVersion: 1,
  id: 'org.example.reading-stats',
  name: '%name%',
  version: '0.1.0',
  sdk: '^0.1.0',
  trust: 'full',
  main: 'main.js',
  activationEvents: ['onReaderOpen'],
  permissions: [
    { name: 'reader.events', reason: 'Track pages' },
    { name: 'network:https://api.example.com', reason: 'Sync' },
  ],
  contributes: {
    commands: [{ id: 'open-stats', title: 'Open' }],
    slots: {
      'reader.toolbar': [{ id: 'stats-button', command: 'open-stats', icon: 'chart' }],
      'reader.panel': [{ id: 'stats', title: 'Stats', icon: 'chart' }],
    },
    settings: [{ key: 'limit', type: 'number', title: 'Limit', default: 80, min: 20, max: 300 }],
  },
};

describe('plugin manifest', () => {
  it('accepts a complete manifest and fills empty contribution lists', () => {
    const result = parsePluginManifest(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.contributes.slots['reader.overlay']).toEqual([]);
    expect(networkOrigins(result.manifest)).toEqual(['https://api.example.com']);
  });

  it('defaults every optional section', () => {
    const { activationEvents, permissions, contributes, ...minimal } = valid;
    void activationEvents;
    void permissions;
    void contributes;
    const result = parsePluginManifest(minimal);
    expect(result.ok && result.manifest.contributes.commands).toEqual([]);
  });

  it('rejects unknown fields, permissions and slots', () => {
    const result = parsePluginManifest({
      ...valid,
      extra: true,
      permissions: [
        { name: 'files.everything', reason: 'x' },
        { name: 'network:http://insecure.test', reason: 'x' },
      ],
      contributes: { slots: { 'app.tab': [] } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'permissions.0.name: unknown permission',
        'permissions.1.name: unknown permission',
        'contributes.slots: Unrecognized key: "app.tab"',
        '(root): Unrecognized key: "extra"',
      ]),
    );
  });

  it('rejects dangling command references and inconsistent settings', () => {
    const result = parsePluginManifest({
      ...valid,
      contributes: {
        commands: [],
        slots: { 'reader.toolbar': [{ id: 'a', command: 'missing' }] },
        settings: [
          { key: 'mode', type: 'select', title: 'Mode', default: 'c', options: [{ value: 'a', label: 'A' }] },
          { key: 'size', type: 'number', title: 'Size', default: 1, min: 5 },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      'contributes.slots.reader.toolbar.0.command: refers to an undeclared command',
      'contributes.settings.0.default: must be one of the options',
      'contributes.settings.1.default: must be within min and max',
    ]);
  });

  it('rejects ids that are not reverse-domain names and invalid sdk ranges', () => {
    expect(parsePluginManifest({ ...valid, id: 'Stats' }).ok).toBe(false);
    expect(parsePluginManifest({ ...valid, sdk: 'latest' }).ok).toBe(false);
  });

  it('localizes percent-wrapped text and keeps plain text', () => {
    expect(localizeManifestText('%name%', { name: '阅读统计' })).toBe('阅读统计');
    expect(localizeManifestText('%missing%', {})).toBe('missing');
    expect(localizeManifestText('Plain', undefined)).toBe('Plain');
  });
});

describe('version ranges', () => {
  it('treats caret ranges on 0.x as minor-locked', () => {
    expect(satisfiesVersionRange('0.1.4', '^0.1.0')).toBe(true);
    expect(satisfiesVersionRange('0.2.0', '^0.1.0')).toBe(false);
    expect(satisfiesVersionRange('1.9.0', '^1.2.0')).toBe(true);
    expect(satisfiesVersionRange('2.0.0', '^1.2.0')).toBe(false);
  });

  it('supports tilde, exact and explicit bounds', () => {
    expect(satisfiesVersionRange('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfiesVersionRange('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfiesVersionRange('1.2.0', '1.2.0')).toBe(true);
    expect(satisfiesVersionRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfiesVersionRange('not-a-version', '^1.0.0')).toBe(false);
  });

  it('orders prereleases before their release', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
  });
});
