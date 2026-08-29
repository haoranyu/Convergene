import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    createScript() {
      return { exec };
    }
  },
}));

import { UpstashProviderConfigStore } from './upstash-store';
import type { ProviderConfigWrite } from './store';

describe('UpstashProviderConfigStore', () => {
  beforeEach(() => {
    exec.mockReset();
  });

  it.each([
    ['an automatically deserialized response', { version: 2 }],
    ['a serialized response', JSON.stringify({ version: 2 })],
  ])('accepts %s from a touch script', async (_label, response) => {
    exec.mockResolvedValue(response);
    const store = new UpstashProviderConfigStore('https://redis.example', 'test-token');
    const touch = {
      credentialRevision: 'a'.repeat(22),
      lastUsedAt: '2026-08-29T00:00:00.000Z',
      nextRecordRevision: 'b'.repeat(22),
      provider: 'STEPFUN' as const,
      ttlSeconds: 60,
    };

    await expect(store.touch('provider-config:test', touch)).resolves.toEqual({ version: 2 });
    expect(exec).toHaveBeenCalledWith(
      ['provider-config:test'],
      ['STEPFUN', touch.credentialRevision, touch.lastUsedAt, touch.nextRecordRevision, '60'],
    );
  });

  it('sends a revision expectation and complete replacement through one script call', async () => {
    exec.mockResolvedValue(1);
    const store = new UpstashProviderConfigStore('https://redis.example', 'test-token');
    const record = { revision: 'b'.repeat(22), version: 2 } as ProviderConfigWrite['record'];

    await expect(
      store.compareAndSet('provider-config:test', {
        expectation: { revision: 'a'.repeat(22), state: 'V2' },
        record,
        ttlSeconds: 60,
      }),
    ).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith(
      ['provider-config:test'],
      ['V2', 'a'.repeat(22), JSON.stringify(record), '60'],
    );
  });
});
