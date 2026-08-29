import 'server-only';

import { Redis } from '@upstash/redis';

import type { ProviderConfigStore, ProviderConfigTouch, ProviderConfigWrite } from './store';

const consumeRateLimitScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const compareAndSetProviderConfigScript = `
local value = redis.call('GET', KEYS[1])
local expectation = ARGV[1]

if expectation == 'MISSING' then
  if value then
    return 0
  end
else
  if not value then
    return 0
  end

  local decoded, record = pcall(cjson.decode, value)
  if expectation == 'INVALID' then
    if decoded and type(record) == 'table' and record.version == 2 and type(record.revision) == 'string' then
      return 0
    end
  elseif not decoded or type(record) ~= 'table' then
    return 0
  elseif expectation == 'LEGACY' then
    if record.version ~= 1 then
      return 0
    end
  elseif expectation == 'V2' then
    if record.version ~= 2 or record.revision ~= ARGV[2] then
      return 0
    end
  else
    return redis.error_reply('invalid provider configuration expectation')
  end
end

redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
return 1
`;

const touchProviderConfigScript = `
local value = redis.call('GET', KEYS[1])
if not value then
  return false
end

local decoded, record = pcall(cjson.decode, value)
if not decoded or type(record) ~= 'table' then
  return redis.error_reply('invalid provider configuration')
end

if record.version ~= 2 or type(record.providers) ~= 'table' then
  return redis.error_reply('invalid provider configuration')
end

local credential = record.providers[ARGV[1]]
if type(credential) ~= 'table' then
  return redis.error_reply('provider credential not found')
end
if record.activeProvider ~= ARGV[1] or credential.revision ~= ARGV[2] then
  return cjson.encode(record)
end
if type(credential.lastUsedAt) ~= 'string' or ARGV[3] > credential.lastUsedAt then
  credential.lastUsedAt = ARGV[3]
end
record.revision = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5], 'XX')
return cjson.encode(record)
`;

export class UpstashProviderConfigStore implements ProviderConfigStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ enableTelemetry: false, token, url });
  }

  async compareAndSet(key: string, write: ProviderConfigWrite): Promise<boolean> {
    const script = this.redis.createScript<number>(compareAndSetProviderConfigScript);
    const expectedRevision = write.expectation.state === 'V2' ? write.expectation.revision : '';
    return (
      (await script.exec(
        [key],
        [
          write.expectation.state,
          expectedRevision,
          JSON.stringify(write.record),
          String(write.ttlSeconds),
        ],
      )) === 1
    );
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

  async touch(key: string, touch: ProviderConfigTouch): Promise<unknown | null> {
    const script = this.redis.createScript<unknown | null>(touchProviderConfigScript);
    const result = await script.exec(
      [key],
      [
        touch.provider,
        touch.credentialRevision,
        touch.lastUsedAt,
        touch.nextRecordRevision,
        String(touch.ttlSeconds),
      ],
    );
    if (result === null || typeof result !== 'string') {
      return result;
    }
    return JSON.parse(result);
  }
}
