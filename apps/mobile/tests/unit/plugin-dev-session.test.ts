import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEV_LOG_FLUSH_MS, PluginDevSession } from '../../src/features/plugins/services/plugin-dev-session';

const token = '0123456789abcdef0123456789abcdef';

function session() {
  const requests: { url: string; init?: RequestInit }[] = [];
  const devSession = new PluginDevSession(`http://127.0.0.1:5757/?token=${token}`, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 204 });
    },
    locales: () => ['zh-CN'],
    onPlugin: vi.fn(),
    onStatus: vi.fn(),
    onStop: vi.fn(),
  });
  return { devSession, requests };
}

describe('plugin dev session logs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends log entries to the terminal in batches', async () => {
    vi.useFakeTimers();
    const { devSession, requests } = session();
    devSession.sendLog({ level: 'info', message: 'one', at: 1 });
    devSession.sendLog({ level: 'error', message: 'two', at: 2 });
    expect(requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(DEV_LOG_FLUSH_MS);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`http://127.0.0.1:5757/logs?token=${token}`);
    expect(requests[0].init?.method).toBe('POST');
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      entries: [
        { level: 'info', message: 'one', at: 1 },
        { level: 'error', message: 'two', at: 2 },
      ],
    });
  });

  it('drops queued entries once stopped', async () => {
    vi.useFakeTimers();
    const { devSession, requests } = session();
    devSession.sendLog({ level: 'info', message: 'late', at: 1 });
    devSession.stop();
    devSession.sendLog({ level: 'info', message: 'later', at: 2 });
    await vi.advanceTimersByTimeAsync(DEV_LOG_FLUSH_MS * 2);
    expect(requests).toHaveLength(0);
  });
});
