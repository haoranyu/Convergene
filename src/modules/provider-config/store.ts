import 'server-only';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { AesGcmEnvelope } from './credential-crypto';
import type { ProviderId } from './model';

export const providerConfigTtlSeconds = 30 * 24 * 60 * 60;

function canonicalBase64Schema(label: string, expectedBytes?: number) {
  return z
    .string()
    .min(1)
    .max(1_024)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u)
    .refine((value) => Buffer.from(value, 'base64').toString('base64') === value, {
      message: `${label} must be canonical base64`,
    })
    .refine(
      (value) =>
        expectedBytes === undefined || Buffer.from(value, 'base64').byteLength === expectedBytes,
      { message: `${label} has an invalid length` },
    );
}

export const encryptedProviderConfigSchema = z
  .object({
    authTag: canonicalBase64Schema('authTag', 16),
    ciphertext: canonicalBase64Schema('ciphertext'),
    createdAt: z.iso.datetime(),
    iv: canonicalBase64Schema('iv', 12),
    lastUsedAt: z.iso.datetime(),
    provider: z.enum(['STEPFUN', 'SILICONFLOW'] satisfies ProviderId[]),
    version: z.literal(1),
  })
  .strict();

export type EncryptedProviderConfig = z.infer<typeof encryptedProviderConfigSchema>;

export interface ProviderConfigStore {
  consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<number>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<unknown>;
  has(key: string): Promise<boolean>;
  set(key: string, value: EncryptedProviderConfig, ttlSeconds: number): Promise<void>;
  touch(key: string, lastUsedAt: string, ttlSeconds: number): Promise<string | null>;
}

export function providerConfigKey(sessionId: string): string {
  return `provider-config:${createHash('sha256').update(sessionId).digest('hex')}`;
}

export function rateLimitKey(scope: string): string {
  return `rate-limit:provider-config:${createHash('sha256').update(scope).digest('hex')}`;
}

export function toEncryptedProviderConfig(
  envelope: AesGcmEnvelope,
  provider: ProviderId,
  timestamp: string,
  createdAt = timestamp,
): EncryptedProviderConfig {
  return {
    ...envelope,
    createdAt,
    lastUsedAt: timestamp,
    provider,
  };
}
