import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

import type { AesGcmEnvelope } from './credential-crypto';
import { providerIds, type ProviderId } from './model';

export const providerConfigTtlSeconds = 30 * 24 * 60 * 60;

const revisionSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/u);

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

const legacyEncryptedProviderConfigSchema = z
  .object({
    authTag: canonicalBase64Schema('authTag', 16),
    ciphertext: canonicalBase64Schema('ciphertext'),
    createdAt: z.iso.datetime(),
    iv: canonicalBase64Schema('iv', 12),
    lastUsedAt: z.iso.datetime(),
    provider: z.enum(providerIds),
    version: z.literal(1),
  })
  .strict();

export const encryptedProviderCredentialSchema = z
  .object({
    authTag: canonicalBase64Schema('authTag', 16),
    ciphertext: canonicalBase64Schema('ciphertext'),
    createdAt: z.iso.datetime(),
    health: z.enum(['AVAILABLE', 'AUTH_REJECTED', 'DECRYPTION_FAILED']),
    iv: canonicalBase64Schema('iv', 12),
    keyId: z.union([z.literal('legacy'), z.string().regex(/^sha256:[a-f0-9]{64}$/u)]),
    lastUsedAt: z.iso.datetime(),
    revision: revisionSchema,
    version: z.literal(1),
  })
  .strict();

const providerCredentialSlotsSchema = z
  .object({
    SILICONFLOW: encryptedProviderCredentialSchema.optional(),
    STEPFUN: encryptedProviderCredentialSchema.optional(),
  })
  .strict();

export const encryptedProviderConfigV2Schema = z
  .object({
    activeProvider: z.enum(providerIds),
    providers: providerCredentialSlotsSchema,
    revision: revisionSchema,
    version: z.literal(2),
  })
  .strict()
  .superRefine((record, context) => {
    if (!record.providers[record.activeProvider]) {
      context.addIssue({
        code: 'custom',
        message: 'The active provider must have a stored credential',
        path: ['activeProvider'],
      });
    }
  });

export const encryptedProviderConfigSchema = z.union([
  legacyEncryptedProviderConfigSchema,
  encryptedProviderConfigV2Schema,
]);

export type LegacyEncryptedProviderConfig = z.infer<typeof legacyEncryptedProviderConfigSchema>;
export type EncryptedProviderCredential = z.infer<typeof encryptedProviderCredentialSchema>;
export type EncryptedProviderConfigV2 = z.infer<typeof encryptedProviderConfigV2Schema>;
export type EncryptedProviderConfig = z.infer<typeof encryptedProviderConfigSchema>;

export type ProviderConfigWriteExpectation =
  | { state: 'INVALID' }
  | { state: 'LEGACY' }
  | { state: 'MISSING' }
  | { revision: string; state: 'V2' };

export interface ProviderConfigWrite {
  expectation: ProviderConfigWriteExpectation;
  record: EncryptedProviderConfigV2;
  ttlSeconds: number;
}

export interface ProviderConfigTouch {
  credentialRevision: string;
  lastUsedAt: string;
  nextRecordRevision: string;
  provider: ProviderId;
  ttlSeconds: number;
}

export interface ProviderConfigPreload {
  key: string;
  record: unknown | null;
}

export interface ProviderConfigRateLimitInput {
  clientRateLimitKey: string;
  limit: number;
  session?: {
    providerConfigKey: string;
    rateLimitKey: string;
  };
  windowSeconds: number;
}

export interface ProviderConfigRateLimitResult {
  count: number;
  record: unknown | null;
}

export interface ProviderConfigStore {
  compareAndSet(key: string, write: ProviderConfigWrite): Promise<boolean>;
  consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<number>;
  consumeRateLimitAndReadConfig(
    input: ProviderConfigRateLimitInput,
  ): Promise<ProviderConfigRateLimitResult>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<unknown>;
  has(key: string): Promise<boolean>;
  touch(key: string, touch: ProviderConfigTouch): Promise<unknown | null>;
}

export function providerConfigKey(sessionId: string): string {
  return `provider-config:${createHash('sha256').update(sessionId).digest('hex')}`;
}

export function rateLimitKey(scope: string, namespace = 'provider-config'): string {
  return `rate-limit:${namespace}:${createHash('sha256').update(scope).digest('hex')}`;
}

export function createProviderConfigRevision(): string {
  return randomBytes(16).toString('base64url');
}

export function toEncryptedProviderCredential(
  envelope: AesGcmEnvelope,
  timestamp: string,
  createdAt = timestamp,
  revision = createProviderConfigRevision(),
): EncryptedProviderCredential {
  return {
    ...envelope,
    createdAt,
    health: 'AVAILABLE',
    lastUsedAt: timestamp,
    revision,
  };
}

export function toEncryptedProviderConfig(
  activeProvider: ProviderId,
  providers: Partial<Record<ProviderId, EncryptedProviderCredential>>,
  revision = createProviderConfigRevision(),
): EncryptedProviderConfigV2 {
  return encryptedProviderConfigV2Schema.parse({
    activeProvider,
    providers,
    revision,
    version: 2,
  });
}
