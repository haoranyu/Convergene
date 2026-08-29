import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { RedisValidationClient } from './redis-lifecycle';
import { validateEncryptedRedisLifecycle } from './redis-lifecycle';

class MemoryRedisValidationClient implements RedisValidationClient {
  private readonly records = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(private nowSeconds = 1_000) {}

  async del(key: string): Promise<number> {
    return this.records.delete(key) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<0 | 1> {
    const record = this.records.get(key);
    if (!record) {
      return 0;
    }
    record.expiresAt = this.nowSeconds + seconds;
    return 1;
  }

  async get<TData>(key: string): Promise<TData | null> {
    return (this.records.get(key)?.value as TData | undefined) ?? null;
  }

  async set<TData>(key: string, value: TData, options: { ex: number }): Promise<'OK'> {
    this.records.set(key, { expiresAt: this.nowSeconds + options.ex, value });
    return 'OK';
  }

  async ttl(key: string): Promise<number> {
    const record = this.records.get(key);
    return record ? record.expiresAt - this.nowSeconds : -2;
  }
}

describe('encrypted Redis lifecycle validation harness', () => {
  it('sets, reads, decrypts, renews expiry, and deletes without returning the credential', async () => {
    const result = await validateEncryptedRedisLifecycle(new MemoryRedisValidationClient(), {
      apiKey: 'test-only-provider-credential',
      encryptionSecret: randomBytes(32).toString('base64'),
      key: 'integration-validation:test-record',
    });

    expect(result).toEqual({
      deleted: true,
      initialTtlSeconds: 60,
      renewedTtlSeconds: 120,
      roundTripMatched: true,
    });
    expect(result).not.toHaveProperty('apiKey');
  });
});
