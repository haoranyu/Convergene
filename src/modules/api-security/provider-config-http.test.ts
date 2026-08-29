import { describe, expect, it } from 'vitest';

import type { ProviderConfigStore } from '../provider-config/server';
import {
  ApiSecurityError,
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readProviderConfigInput,
} from './provider-config-http';

describe('provider configuration HTTP security', () => {
  it('requires an exact same-origin Origin header', () => {
    expect(() =>
      assertSameOrigin(
        new Request('https://convergene.example/api/provider-config', {
          headers: { origin: 'https://convergene.example' },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(new Request('https://convergene.example/api/provider-config')),
    ).toThrowError(new ApiSecurityError('ORIGIN_INVALID'));
    expect(() =>
      assertSameOrigin(
        new Request('https://convergene.example/api/provider-config', {
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    ).toThrowError(new ApiSecurityError('ORIGIN_INVALID'));
  });

  it('parses only strict whitelisted JSON input', async () => {
    const request = new Request('https://convergene.example/api/provider-config', {
      body: JSON.stringify({ apiKey: 'test-key', provider: 'STEPFUN' }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
      method: 'PUT',
    });
    await expect(readProviderConfigInput(request)).resolves.toEqual({
      apiKey: 'test-key',
      provider: 'STEPFUN',
    });

    const injected = new Request('https://convergene.example/api/provider-config', {
      body: JSON.stringify({
        apiKey: 'test-key',
        baseURL: 'https://attacker.example',
        provider: 'STEPFUN',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    });
    await expect(readProviderConfigInput(injected)).rejects.toMatchObject({
      code: 'INPUT_INVALID',
    });
  });

  it('rejects oversized chunked bodies without relying on Content-Length', async () => {
    const request = new Request('https://convergene.example/api/provider-config', {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1_500));
          controller.enqueue(new Uint8Array(1_500));
          controller.close();
        },
      }),
      duplex: 'half',
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    } as RequestInit & { duplex: 'half' });

    await expect(readProviderConfigInput(request)).rejects.toMatchObject({
      code: 'INPUT_INVALID',
    });
  });

  it('allows the limit and rejects the next request using a hashed scope', async () => {
    let count = 0;
    let receivedKey = '';
    const store = {
      consumeRateLimit(key: string) {
        receivedKey = key;
        count += 1;
        return Promise.resolve(count);
      },
      delete: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
      set: () => Promise.resolve(),
      touch: () => Promise.resolve(false),
    } as ProviderConfigStore;
    const request = new Request('https://convergene.example/api/provider-config', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    for (let index = 0; index < 30; index += 1) {
      await expect(enforceProviderConfigRateLimit(request, store)).resolves.toBeUndefined();
    }
    await expect(enforceProviderConfigRateLimit(request, store)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(receivedKey).toMatch(/^rate-limit:provider-config:[a-f0-9]{64}$/u);
    expect(receivedKey).not.toContain('203.0.113.10');
  });

  it('keeps forged session cookies in the pre-session client bucket', async () => {
    const receivedKeys: string[] = [];
    const store = {
      consumeRateLimit(key: string) {
        receivedKeys.push(key);
        return Promise.resolve(1);
      },
      delete: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
      set: () => Promise.resolve(),
      touch: () => Promise.resolve(false),
    } as ProviderConfigStore;

    for (const sessionId of ['A'.repeat(43), 'B'.repeat(43)]) {
      await enforceProviderConfigRateLimit(
        new Request('https://convergene.example/api/provider-config', {
          headers: {
            cookie: `convergene_session=${sessionId}`,
            'x-vercel-forwarded-for': '203.0.113.11',
          },
        }),
        store,
      );
    }

    expect(receivedKeys).toHaveLength(2);
    expect(receivedKeys[0]).toBe(receivedKeys[1]);
  });

  it('distinguishes rate-store failure from a consumed limit', async () => {
    const store = {
      consumeRateLimit: () => Promise.reject(new Error('raw Redis failure')),
      delete: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
      set: () => Promise.resolve(),
      touch: () => Promise.resolve(false),
    } as ProviderConfigStore;

    await expect(
      enforceProviderConfigRateLimit(
        new Request('https://convergene.example/api/provider-config'),
        store,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_CONFIG_UNAVAILABLE' });
  });
});
