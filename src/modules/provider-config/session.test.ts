import { describe, expect, it } from 'vitest';

import {
  createProviderSessionId,
  parseProviderSessionId,
  providerSessionCookieName,
  providerSessionCookieOptions,
  providerSessionMaxAgeSeconds,
} from './session';
import { providerConfigKey, rateLimitKey } from './store';

describe('anonymous provider session', () => {
  it('creates a validated 256-bit opaque id and stores only its hash in Redis keys', () => {
    const sessionId = createProviderSessionId();

    expect(Buffer.from(sessionId, 'base64url')).toHaveLength(32);
    expect(parseProviderSessionId(sessionId)).toBe(sessionId);
    expect(providerConfigKey(sessionId)).toMatch(/^provider-config:[a-f0-9]{64}$/u);
    expect(providerConfigKey(sessionId)).not.toContain(sessionId);
    expect(rateLimitKey(`session:${sessionId}`)).not.toContain(sessionId);
  });

  it('rejects malformed ids and pins the hardened 30-day cookie contract', () => {
    expect(parseProviderSessionId('short')).toBeUndefined();
    expect(parseProviderSessionId(`${createProviderSessionId()}\n`)).toBeUndefined();
    expect(providerSessionCookieName).toBe('convergene_session');
    expect(providerSessionCookieOptions).toEqual({
      httpOnly: true,
      maxAge: providerSessionMaxAgeSeconds,
      path: '/',
      sameSite: 'strict',
      secure: true,
    });
    expect(providerSessionMaxAgeSeconds).toBe(30 * 24 * 60 * 60);
  });
});
