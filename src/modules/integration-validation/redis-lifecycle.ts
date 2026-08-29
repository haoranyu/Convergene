import type { AesGcmEnvelope } from './aes-gcm';
import { decryptCredential, encryptCredential } from './aes-gcm';

export interface RedisValidationClient {
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<0 | 1>;
  get<TData>(key: string): Promise<TData | null>;
  set<TData>(key: string, value: TData, options: { ex: number }): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

export interface RedisLifecycleValidationResult {
  deleted: true;
  initialTtlSeconds: number;
  renewedTtlSeconds: number;
  roundTripMatched: true;
}

interface RedisLifecycleValidationOptions {
  apiKey: string;
  encryptionSecret: string;
  initialTtlSeconds?: number;
  key: string;
  renewedTtlSeconds?: number;
}

export async function validateEncryptedRedisLifecycle(
  redis: RedisValidationClient,
  {
    apiKey,
    encryptionSecret,
    initialTtlSeconds = 60,
    key,
    renewedTtlSeconds = 120,
  }: RedisLifecycleValidationOptions,
): Promise<RedisLifecycleValidationResult> {
  const envelope = encryptCredential(apiKey, encryptionSecret);

  try {
    await redis.set(key, envelope, { ex: initialTtlSeconds });
    const savedEnvelope = await redis.get<AesGcmEnvelope>(key);

    if (!savedEnvelope || decryptCredential(savedEnvelope, encryptionSecret) !== apiKey) {
      throw new Error('Encrypted Redis round-trip validation failed');
    }

    const initialTtl = await redis.ttl(key);
    if (initialTtl <= 0 || initialTtl > initialTtlSeconds) {
      throw new Error('Redis initial expiry validation failed');
    }

    const renewed = await redis.expire(key, renewedTtlSeconds);
    const renewedTtl = await redis.ttl(key);
    if (renewed !== 1 || renewedTtl <= initialTtl || renewedTtl > renewedTtlSeconds) {
      throw new Error('Redis expiry renewal validation failed');
    }

    await redis.del(key);
    if ((await redis.get(key)) !== null) {
      throw new Error('Redis delete validation failed');
    }

    return {
      deleted: true,
      initialTtlSeconds: initialTtl,
      renewedTtlSeconds: renewedTtl,
      roundTripMatched: true,
    };
  } finally {
    await redis.del(key);
  }
}
