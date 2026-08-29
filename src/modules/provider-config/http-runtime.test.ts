import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { readProviderConfigRuntimeEnvironment } from './http-runtime';

const redisEnvironment = {
  UPSTASH_REDIS_REST_TOKEN: 'test-only-redis-token',
  UPSTASH_REDIS_REST_URL: 'https://redis.example',
};

describe('provider configuration runtime environment', () => {
  it('accepts only a canonical 32-byte base64 encryption secret', () => {
    const secret = randomBytes(32).toString('base64');

    expect(
      readProviderConfigRuntimeEnvironment({
        ...redisEnvironment,
        APP_ENCRYPTION_SECRET: secret,
      }),
    ).toEqual({
      encryptionSecret: secret,
      redisToken: redisEnvironment.UPSTASH_REDIS_REST_TOKEN,
      redisUrl: redisEnvironment.UPSTASH_REDIS_REST_URL,
    });
  });

  it.each(['not-base64', Buffer.alloc(31).toString('base64'), ''])(
    'maps malformed encryption secret %j to configuration unavailable',
    (secret) => {
      expect(() =>
        readProviderConfigRuntimeEnvironment({
          ...redisEnvironment,
          APP_ENCRYPTION_SECRET: secret,
        }),
      ).toThrowError('PROVIDER_CONFIG_UNAVAILABLE');
    },
  );
});
