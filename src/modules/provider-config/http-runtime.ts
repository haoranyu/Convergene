import 'server-only';

import { cookies } from 'next/headers';

import { assertValidEncryptionSecret } from './credential-crypto';
import { getE2EProviderConfigStore } from './in-memory-store';
import type { ProviderConfigApiResponse, ProviderConfigErrorCode } from './model';
import { ProviderConnectionError, testProviderConnection } from './provider-connection';
import { providerPresets } from './presets';
import {
  providerSessionCookieName,
  providerSessionCookieOptions,
  type ProviderSessionCookie,
} from './session';
import { createProviderConfigService, ProviderConfigServiceError } from './service';
import type { ProviderConfigStore } from './store';
import { UpstashProviderConfigStore } from './upstash-store';

function requiredEnvironmentVariable(
  environment: Record<string, string | undefined>,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new ProviderConfigServiceError('PROVIDER_CONFIG_UNAVAILABLE');
  }
  return value;
}

interface ProviderConfigRuntimeEnvironment {
  encryptionSecret: string;
  previousEncryptionSecrets: string[];
  redisToken: string;
  redisUrl: string;
}

export function readProviderConfigRuntimeEnvironment(
  environment: Record<string, string | undefined> = process.env,
): ProviderConfigRuntimeEnvironment {
  const encryptionSecret = requiredEnvironmentVariable(environment, 'APP_ENCRYPTION_SECRET');
  const previousEncryptionSecrets = (environment.APP_ENCRYPTION_PREVIOUS_SECRETS ?? '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
  try {
    assertValidEncryptionSecret(encryptionSecret);
    previousEncryptionSecrets.forEach(assertValidEncryptionSecret);
  } catch {
    throw new ProviderConfigServiceError('PROVIDER_CONFIG_UNAVAILABLE');
  }

  return {
    encryptionSecret,
    previousEncryptionSecrets,
    redisToken: requiredEnvironmentVariable(environment, 'UPSTASH_REDIS_REST_TOKEN'),
    redisUrl: requiredEnvironmentVariable(environment, 'UPSTASH_REDIS_REST_URL'),
  };
}

export async function createProviderConfigRuntime() {
  const environment = readProviderConfigRuntimeEnvironment();
  const e2eMode =
    process.env.NODE_ENV !== 'production' && process.env.CONVERGENE_E2E_PROVIDER_CONFIG === '1';
  const cookieStore = await cookies();
  const session: ProviderSessionCookie = {
    clear() {
      cookieStore.set(providerSessionCookieName, '', {
        ...providerSessionCookieOptions,
        maxAge: 0,
      });
    },
    get() {
      return cookieStore.get(providerSessionCookieName)?.value;
    },
    set(sessionId) {
      cookieStore.set(providerSessionCookieName, sessionId, providerSessionCookieOptions);
    },
  };
  const store: ProviderConfigStore = e2eMode
    ? getE2EProviderConfigStore()
    : new UpstashProviderConfigStore(environment.redisUrl, environment.redisToken);
  const service = createProviderConfigService({
    encryptionSecret: environment.encryptionSecret,
    previousEncryptionSecrets: environment.previousEncryptionSecrets,
    session,
    store,
    testConnection: e2eMode
      ? (input) =>
          Promise.resolve({
            models: providerPresets[input.provider].models,
            provider: input.provider,
          })
      : (input, signal) => testProviderConnection({ ...input, abortSignal: signal }),
  });

  return { service, store };
}

function statusForErrorCode(code: ProviderConfigErrorCode): number {
  switch (code) {
    case 'INPUT_INVALID':
      return 400;
    case 'ORIGIN_INVALID':
    case 'PROVIDER_ACCESS_RESTRICTED':
      return 403;
    case 'PROVIDER_AUTH_FAILED':
      return 401;
    case 'PROVIDER_CONFIG_INVALID':
    case 'PROVIDER_MODEL_NOT_FOUND':
    case 'PROVIDER_CAPABILITY_UNAVAILABLE':
      return 422;
    case 'PROVIDER_RATE_LIMITED':
    case 'RATE_LIMITED':
      return 429;
    case 'PROVIDER_CONFIG_UNAVAILABLE':
    case 'PROVIDER_UNAVAILABLE':
      return 503;
  }
}

export function providerConfigJson<Value>(
  body: ProviderConfigApiResponse<Value>,
  status = 200,
): Response {
  return Response.json(body, {
    headers: { 'Cache-Control': 'no-store' },
    status,
  });
}

export function providerConfigErrorResponse(error: unknown): Response {
  const code =
    error instanceof ProviderConfigServiceError || error instanceof ProviderConnectionError
      ? error.code
      : typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof error.code === 'string' &&
          [
            'INPUT_INVALID',
            'ORIGIN_INVALID',
            'PROVIDER_AUTH_FAILED',
            'PROVIDER_ACCESS_RESTRICTED',
            'PROVIDER_CAPABILITY_UNAVAILABLE',
            'PROVIDER_CONFIG_INVALID',
            'PROVIDER_CONFIG_UNAVAILABLE',
            'PROVIDER_MODEL_NOT_FOUND',
            'PROVIDER_RATE_LIMITED',
            'PROVIDER_UNAVAILABLE',
            'RATE_LIMITED',
          ].includes(error.code)
        ? (error.code as ProviderConfigErrorCode)
        : 'PROVIDER_CONFIG_UNAVAILABLE';

  return providerConfigJson({ error: { code }, ok: false }, statusForErrorCode(code));
}
