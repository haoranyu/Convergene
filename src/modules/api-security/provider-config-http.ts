import 'server-only';

import type { z } from 'zod';

import type { ProviderConfigInput } from '../provider-config';
import { providerConfigInputSchema } from '../provider-config';
import {
  parseProviderSessionId,
  providerConfigKey,
  providerSessionCookieName,
  rateLimitKey,
  type ProviderConfigPreload,
  type ProviderConfigStore,
} from '../provider-config/server';

const maximumRequestBodyBytes = 2_048;

export class ApiSecurityError extends Error {
  constructor(
    readonly code:
      'INPUT_INVALID' | 'ORIGIN_INVALID' | 'PROVIDER_CONFIG_UNAVAILABLE' | 'RATE_LIMITED',
  ) {
    super(code);
    this.name = 'ApiSecurityError';
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) {
    throw new ApiSecurityError('ORIGIN_INVALID');
  }

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',', 1)[0]?.trim();
    const publicHost = forwardedHost || request.headers.get('host');
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',', 1)[0]?.trim();
    const publicProtocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);
    const publicOrigin = publicHost ? `${publicProtocol}://${publicHost}` : undefined;

    if (originUrl.origin !== requestUrl.origin && originUrl.origin !== publicOrigin) {
      throw new ApiSecurityError('ORIGIN_INVALID');
    }
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      throw error;
    }
    throw new ApiSecurityError('ORIGIN_INVALID');
  }
}

export async function readJsonInput<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  maximumBytes = maximumRequestBodyBytes,
): Promise<z.infer<Schema>> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    throw new ApiSecurityError('INPUT_INVALID');
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (
    !Number.isInteger(maximumBytes) ||
    maximumBytes < 1 ||
    (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
  ) {
    throw new ApiSecurityError('INPUT_INVALID');
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new ApiSecurityError('INPUT_INVALID');
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new ApiSecurityError('INPUT_INVALID');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      throw error;
    }
    throw new ApiSecurityError('INPUT_INVALID');
  }

  try {
    const body = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return schema.parse(JSON.parse(new TextDecoder().decode(body)));
  } catch {
    throw new ApiSecurityError('INPUT_INVALID');
  }
}

export function readProviderConfigInput(request: Request): Promise<ProviderConfigInput> {
  return readJsonInput(request, providerConfigInputSchema);
}

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return undefined;
  }

  let value: string | undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      if (value !== undefined) {
        throw new ApiSecurityError('INPUT_INVALID');
      }
      value = part.slice(separator + 1).trim();
    }
  }

  if (value === undefined) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    throw new ApiSecurityError('INPUT_INVALID');
  }
}

function requestClientScope(request: Request): string {
  const forwardedForHeader =
    request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for');
  const forwardedFor = forwardedForHeader?.split(',', 1)[0]?.trim() || 'unknown-client';
  return `client:${forwardedFor}`;
}

export interface ProviderConfigRateLimitGrant {
  config?: ProviderConfigPreload;
}

export async function enforceProviderConfigRateLimit(
  request: Request,
  store: ProviderConfigStore,
  limit = 30,
  windowSeconds = 60,
  namespace = 'provider-config',
): Promise<ProviderConfigRateLimitGrant> {
  try {
    const sessionId = parseProviderSessionId(getCookie(request, providerSessionCookieName));
    const configKey = sessionId ? providerConfigKey(sessionId) : undefined;
    const result = await store.consumeRateLimitAndReadConfig({
      clientRateLimitKey: rateLimitKey(requestClientScope(request), namespace),
      limit,
      ...(sessionId && configKey
        ? {
            session: {
              providerConfigKey: configKey,
              rateLimitKey: rateLimitKey(`session:${sessionId}`, namespace),
            },
          }
        : {}),
      windowSeconds,
    });
    if (result.count > limit) {
      throw new ApiSecurityError('RATE_LIMITED');
    }
    return configKey ? { config: { key: configKey, record: result.record } } : {};
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      throw error;
    }
    throw new ApiSecurityError('PROVIDER_CONFIG_UNAVAILABLE');
  }
}
