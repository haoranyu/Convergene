import { Redis } from '@upstash/redis';

import type { EncryptedProviderConfig, ProviderConfigStore } from './store';

const consumeRateLimitScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export class UpstashProviderConfigStore implements ProviderConfigStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ token, url });
  }

  async consumeRateLimit(key: string, _limit: number, windowSeconds: number): Promise<number> {
    const script = this.redis.createScript<number>(consumeRateLimitScript);
    return script.exec([key], [String(windowSeconds)]);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  get(key: string): Promise<EncryptedProviderConfig | null> {
    return this.redis.get<EncryptedProviderConfig>(key);
  }

  async renew(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.expire(key, ttlSeconds)) === 1;
  }

  async set(key: string, value: EncryptedProviderConfig, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }
}
