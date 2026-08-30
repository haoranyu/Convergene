import { randomUUID } from 'node:crypto';

import { Redis } from '@upstash/redis';
import { describe, expect, it } from 'vitest';

import { UpstashProviderConfigStore } from '@/modules/provider-config/upstash-store';

import { validateEncryptedRedisLifecycle } from './redis-lifecycle';

const redisEnvironmentAvailable = Boolean(
  process.env.APP_ENCRYPTION_SECRET &&
  process.env.UPSTASH_REDIS_REST_TOKEN &&
  process.env.UPSTASH_REDIS_REST_URL,
);
const liveTest = redisEnvironmentAvailable ? it : it.skip;
const redisOperationTimeoutMs = 30_000;
const redisTestTimeoutMs = 35_000;

describe('live Upstash Redis validation', () => {
  liveTest(
    'validates encrypted set/get/expiry renewal/delete on an isolated key',
    async () => {
      const redis = Redis.fromEnv({
        enableTelemetry: false,
        signal: AbortSignal.timeout(redisOperationTimeoutMs),
      });
      const result = await validateEncryptedRedisLifecycle(redis, {
        apiKey: `synthetic-${randomUUID()}`,
        encryptionSecret: process.env.APP_ENCRYPTION_SECRET!,
        key: `convergene:integration-validation:${randomUUID()}`,
      });

      expect(result).toMatchObject({ deleted: true, roundTripMatched: true });
    },
    redisTestTimeoutMs,
  );

  liveTest(
    'atomically rate-limits and preloads an isolated encrypted-record placeholder',
    async () => {
      const redis = Redis.fromEnv({
        enableTelemetry: false,
        signal: AbortSignal.timeout(redisOperationTimeoutMs),
      });
      const store = new UpstashProviderConfigStore(
        process.env.UPSTASH_REDIS_REST_URL!,
        process.env.UPSTASH_REDIS_REST_TOKEN!,
      );
      const isolationId = randomUUID();
      const clientRateLimitKey = `convergene:integration-validation:client-rate:${isolationId}`;
      const providerConfigKey = `convergene:integration-validation:provider-config:${isolationId}`;
      const sessionRateLimitKey = `convergene:integration-validation:session-rate:${isolationId}`;
      const record = { ciphertext: 'synthetic-placeholder', version: 2 };

      try {
        await redis.set(providerConfigKey, record, { ex: 60 });
        await expect(
          store.consumeRateLimitAndReadConfig({
            clientRateLimitKey,
            limit: 2,
            session: { providerConfigKey, rateLimitKey: sessionRateLimitKey },
            windowSeconds: 60,
          }),
        ).resolves.toEqual({ count: 1, record });
      } finally {
        await redis.del(clientRateLimitKey, providerConfigKey, sessionRateLimitKey);
      }
    },
    redisTestTimeoutMs,
  );
});
