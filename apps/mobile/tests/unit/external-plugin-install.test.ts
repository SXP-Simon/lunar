import { beforeEach, describe, expect, it, vi } from 'vitest';
import configure from '../../app.config';
import {
  redirectExternalPluginPackage,
  takeExternalPluginPackage,
} from '../../src/features/plugins/services/external-plugin-install';

const mocks = vi.hoisted(() => ({
  isPackage: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../../src/features/plugins/infrastructure/external-plugin-package', () => ({
  isExternalPluginPackage: mocks.isPackage,
  readExternalPluginPackage: mocks.read,
}));

function requestIdOf(route: string | undefined) {
  return new URL(route!, 'https://lunar.test').searchParams.get('install')!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPackage.mockResolvedValue(true);
  mocks.read.mockResolvedValue({ name: 'demo.lunar-plugin', bytes: new Uint8Array([1]) });
});

describe('external plugin packages', () => {
  it('reads an opened package immediately and hands it to the plugin tab once', async () => {
    const route = await redirectExternalPluginPackage({ path: 'content://provider/document/7' });
    expect(route).toMatch(/^\/plugins\?install=/);
    expect(mocks.read).toHaveBeenCalledWith('content://provider/document/7');
    const id = requestIdOf(route);
    await expect(takeExternalPluginPackage(id)).resolves.toMatchObject({ name: 'demo.lunar-plugin' });
    expect(takeExternalPluginPackage(id)).toBeUndefined();
  });

  it('leaves other paths to the EPUB import', async () => {
    mocks.isPackage.mockResolvedValue(false);
    await expect(redirectExternalPluginPackage({ path: 'content://provider/book' })).resolves.toBeUndefined();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('keeps read failures for the plugin tab to report', async () => {
    mocks.read.mockRejectedValueOnce(new Error('Permission denied'));
    const id = requestIdOf(await redirectExternalPluginPackage({ path: 'file:///inbox/demo.lunar-plugin' }));
    await expect(takeExternalPluginPackage(id)).rejects.toThrow('Permission denied');
  });

  it('associates the package extension on Android and iOS', () => {
    const config = configure({ config: { name: 'lunar', slug: 'lunar' } } as Parameters<typeof configure>[0]);
    expect(config.android?.intentFilters).toContainEqual(
      expect.objectContaining({
        action: 'VIEW',
        data: expect.arrayContaining([{ scheme: 'content', mimeType: 'application/octet-stream' }]),
      }),
    );
    expect(config.ios?.infoPlist?.CFBundleDocumentTypes).toContainEqual(
      expect.objectContaining({ LSItemContentTypes: ['moe.lunar.plugin-package'] }),
    );
    expect(config.ios?.infoPlist?.UTExportedTypeDeclarations).toContainEqual(
      expect.objectContaining({
        UTTypeIdentifier: 'moe.lunar.plugin-package',
        UTTypeTagSpecification: { 'public.filename-extension': ['lunar-plugin'] },
      }),
    );
  });
});
