import { randomUUID } from 'node:crypto';

import { Redis } from '@upstash/redis';
import { describe, expect, it } from 'vitest';

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
});
