import 'server-only';

import { Redis } from '@upstash/redis';

import type { EncryptedProviderConfig, ProviderConfigStore } from './store';

const consumeRateLimitScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const touchProviderConfigScript = `
local value = redis.call('GET', KEYS[1])
if not value then
  return 0
end

local decoded, record = pcall(cjson.decode, value)
if not decoded or type(record) ~= 'table' then
  return redis.error_reply('invalid provider configuration')
end

record.lastUsedAt = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[2], 'XX')
return 1
`;

export class UpstashProviderConfigStore implements ProviderConfigStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ enableTelemetry: false, token, url });
  }

  async consumeRateLimit(key: string, _limit: number, windowSeconds: number): Promise<number> {
    const script = this.redis.createScript<number>(consumeRateLimitScript);
    return script.exec([key], [String(windowSeconds)]);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  get(key: string): Promise<unknown> {
    return this.redis.get(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  async set(key: string, value: EncryptedProviderConfig, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async touch(key: string, lastUsedAt: string, ttlSeconds: number): Promise<boolean> {
    const script = this.redis.createScript<number>(touchProviderConfigScript);
    return (await script.exec([key], [lastUsedAt, String(ttlSeconds)])) === 1;
  }
}
