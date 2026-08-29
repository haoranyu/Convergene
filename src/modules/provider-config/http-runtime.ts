import 'server-only';

import { cookies } from 'next/headers';

import type { ProviderConfigApiResponse, ProviderConfigErrorCode } from './model';
import { ProviderConnectionError, testProviderConnection } from './provider-connection';
import {
  providerSessionCookieName,
  providerSessionCookieOptions,
  type ProviderSessionCookie,
} from './session';
import { createProviderConfigService, ProviderConfigServiceError } from './service';
import { UpstashProviderConfigStore } from './upstash-store';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ProviderConfigServiceError('PROVIDER_CONFIG_UNAVAILABLE');
  }
  return value;
}

export async function createProviderConfigRuntime() {
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
  const store = new UpstashProviderConfigStore(
    requiredEnvironmentVariable('UPSTASH_REDIS_REST_URL'),
    requiredEnvironmentVariable('UPSTASH_REDIS_REST_TOKEN'),
  );
  const service = createProviderConfigService({
    encryptionSecret: requiredEnvironmentVariable('APP_ENCRYPTION_SECRET'),
    session,
    store,
    testConnection: (input, signal) => testProviderConnection({ ...input, abortSignal: signal }),
  });

  return { service, store };
}

function statusForErrorCode(code: ProviderConfigErrorCode): number {
  switch (code) {
    case 'INPUT_INVALID':
      return 400;
    case 'ORIGIN_INVALID':
      return 403;
    case 'PROVIDER_AUTH_FAILED':
      return 401;
    case 'PROVIDER_CONFIG_INVALID':
    case 'PROVIDER_MODEL_NOT_FOUND':
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
