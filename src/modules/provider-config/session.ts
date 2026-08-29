import { randomBytes } from 'node:crypto';

export const providerSessionCookieName = 'convergene_session';
export const providerSessionMaxAgeSeconds = 30 * 24 * 60 * 60;

const sessionIdPattern = /^[A-Za-z0-9_-]{43}$/u;

export interface ProviderSessionCookie {
  clear(): void;
  get(): string | undefined;
  set(sessionId: string): void;
}

export function createProviderSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function parseProviderSessionId(value: string | undefined): string | undefined {
  return value && sessionIdPattern.test(value) ? value : undefined;
}

export const providerSessionCookieOptions = {
  httpOnly: true,
  maxAge: providerSessionMaxAgeSeconds,
  path: '/',
  sameSite: 'strict' as const,
  secure: true,
};
