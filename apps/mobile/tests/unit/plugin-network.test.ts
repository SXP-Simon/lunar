import { describe, expect, it, vi } from 'vitest';

import { createPluginNetwork, NETWORK_LIMITS } from '../../src/features/plugins/services/plugin-network';

describe('plugin network responses', () => {
  it('exposes UTF-8 text and the original binary bytes', async () => {
    const bytes = new TextEncoder().encode('文学少女');
    const fetchImpl = vi.fn(
      async () => new Response(bytes, { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const request = createPluginNetwork(fetchImpl);
    const response = await request(
      'org.example.test',
      ['https://example.com'],
      { url: 'https://example.com/book' },
      new AbortController().signal,
    );
    expect(response.body).toBe('文学少女');
    expect(response.bytes).toEqual(bytes);
  });

  it('enforces the binary response quota', async () => {
    const bytes = new Uint8Array(NETWORK_LIMITS.responseBytes + 1);
    const request = createPluginNetwork(async () => new Response(bytes));
    await expect(
      request(
        'org.example.test',
        ['https://example.com'],
        { url: 'https://example.com/large' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });

  it('does not allocate a UTF-8 string in binary mode', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const request = createPluginNetwork(async () => new Response(bytes));
    const response = await request(
      'org.example.test',
      ['https://example.com'],
      { url: 'https://example.com/image', responseType: 'bytes' },
      new AbortController().signal,
    );
    expect(response.body).toBe('');
    expect(response.bytes).toEqual(bytes);
  });

  it('rejects an oversized declared response before reading its body', async () => {
    const arrayBuffer = vi.fn();
    const response = {
      headers: new Headers({ 'content-length': String(NETWORK_LIMITS.responseBytes + 1) }),
      body: null,
      arrayBuffer,
    } as unknown as Response;
    const request = createPluginNetwork(async () => response);
    await expect(
      request(
        'org.example.test',
        ['https://example.com'],
        { url: 'https://example.com/large', responseType: 'bytes' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
