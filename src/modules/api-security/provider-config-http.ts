import type { ProviderConfigInput } from '../provider-config';
import { providerConfigInputSchema } from '../provider-config';
import { parseProviderSessionId, providerSessionCookieName } from '../provider-config/session';
import { rateLimitKey, type ProviderConfigStore } from '../provider-config/store';

const maximumRequestBodyBytes = 2_048;

export class ApiSecurityError extends Error {
  constructor(readonly code: 'INPUT_INVALID' | 'ORIGIN_INVALID' | 'RATE_LIMITED') {
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
    if (new URL(origin).origin !== new URL(request.url).origin) {
      throw new ApiSecurityError('ORIGIN_INVALID');
    }
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      throw error;
    }
    throw new ApiSecurityError('ORIGIN_INVALID');
  }
}

export async function readProviderConfigInput(request: Request): Promise<ProviderConfigInput> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    throw new ApiSecurityError('INPUT_INVALID');
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumRequestBodyBytes) {
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
      if (byteLength > maximumRequestBodyBytes) {
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
    return providerConfigInputSchema.parse(JSON.parse(new TextDecoder().decode(body)));
  } catch {
    throw new ApiSecurityError('INPUT_INVALID');
  }
}

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }

  return undefined;
}

function requestRateLimitScope(request: Request): string {
  const sessionId = parseProviderSessionId(getCookie(request, providerSessionCookieName));
  if (sessionId) {
    return `session:${sessionId}`;
  }

  const forwardedFor =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim() ??
    'unknown-client';
  return `client:${forwardedFor}`;
}

export async function enforceProviderConfigRateLimit(
  request: Request,
  store: ProviderConfigStore,
  limit = 30,
  windowSeconds = 60,
): Promise<void> {
  try {
    const count = await store.consumeRateLimit(
      rateLimitKey(requestRateLimitScope(request)),
      limit,
      windowSeconds,
    );
    if (count > limit) {
      throw new ApiSecurityError('RATE_LIMITED');
    }
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      throw error;
    }
    throw new ApiSecurityError('RATE_LIMITED');
  }
}
