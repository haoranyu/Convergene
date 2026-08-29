import { createHash } from 'node:crypto';

import type { AesGcmEnvelope } from './credential-crypto';
import type { ProviderId } from './model';

export const providerConfigTtlSeconds = 30 * 24 * 60 * 60;

export interface EncryptedProviderConfig {
  authTag: string;
  ciphertext: string;
  createdAt: string;
  iv: string;
  lastUsedAt: string;
  provider: ProviderId;
  version: 1;
}

export interface ProviderConfigStore {
  consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<number>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<EncryptedProviderConfig | null>;
  renew(key: string, ttlSeconds: number): Promise<boolean>;
  set(key: string, value: EncryptedProviderConfig, ttlSeconds: number): Promise<void>;
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
