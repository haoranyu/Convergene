import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createProviderSessionId,
  providerSessionCookieName,
  type ProviderConfigStore,
} from '../provider-config/server';
import {
  ApiSecurityError,
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
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
      assertSameOrigin(
        new Request('http://localhost:3100/api/provider-config', {
          headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100' },
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

  it('reuses the bounded parser for a larger strict AI contract without weakening it', async () => {
    const schema = z.object({ rawRequest: z.string().min(1).max(4_000) }).strict();
    const request = new Request('https://convergene.example/api/ai/classify-meeting', {
      body: JSON.stringify({ rawRequest: 'x'.repeat(4_000) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    await expect(readJsonInput(request, schema, 8_192)).resolves.toEqual({
      rawRequest: 'x'.repeat(4_000),
    });
    await expect(
      readJsonInput(
        new Request('https://convergene.example/api/ai/classify-meeting', {
          body: JSON.stringify({ meetingId: 'server-index', rawRequest: 'valid' }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
        schema,
        8_192,
      ),
    ).rejects.toMatchObject({ code: 'INPUT_INVALID' });
  });

  it('allows the limit and rejects the next request using a hashed scope', async () => {
    let count = 0;
    let receivedKey = '';
    const store = {
      compareAndSet: () => Promise.resolve(false),
      consumeRateLimit(key: string) {
        receivedKey = key;
        count += 1;
        return Promise.resolve(count);
      },
      delete: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
      touch: () => Promise.resolve(null),
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

  it('keeps AI tasks in a separate rate-limit namespace', async () => {
    const receivedKeys: string[] = [];
    const store = {
      compareAndSet: () => Promise.resolve(false),
      consumeRateLimit(key: string) {
        receivedKeys.push(key);
        return Promise.resolve(1);
      },
      delete: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
      touch: () => Promise.resolve(null),
    } as ProviderConfigStore;
    const request = new Request('https://convergene.example/api/ai/classify-meeting', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    await enforceProviderConfigRateLimit(request, store);
    await enforceProviderConfigRateLimit(request, store, 20, 60, 'classify-meeting');

    expect(receivedKeys[0]).toMatch(/^rate-limit:provider-config:[a-f0-9]{64}$/u);
    expect(receivedKeys[1]).toMatch(/^rate-limit:classify-meeting:[a-f0-9]{64}$/u);
    expect(receivedKeys[0]).not.toBe(receivedKeys[1]);
  });

  it('keeps forged session cookies in the pre-session client bucket', async () => {
    const receivedKeys: string[] = [];
    const store = {
      compareAndSet: () => Promise.resolve(false),
      consumeRateLimit(key: string) {
        receivedKeys.push(key);
        return Promise.resolve(1);
      },
      delete: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
      touch: () => Promise.resolve(null),
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

  it('rejects duplicate session cookies before choosing a rate-limit scope', async () => {
    const sessionId = createProviderSessionId();
    const store = {
      consumeRateLimit: vi.fn(),
      has: vi.fn(),
    } as unknown as ProviderConfigStore;
    const request = new Request('https://convergene.example/api/provider-config/status', {
      headers: {
        cookie: `${providerSessionCookieName}=${sessionId}; ${providerSessionCookieName}=${createProviderSessionId()}`,
        'x-forwarded-for': '203.0.113.10',
      },
    });

    await expect(enforceProviderConfigRateLimit(request, store)).rejects.toMatchObject({
      code: 'INPUT_INVALID',
    });
    expect(store.has).not.toHaveBeenCalled();
    expect(store.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('distinguishes rate-store failure from a consumed limit', async () => {
    const store = {
      compareAndSet: () => Promise.resolve(false),
      consumeRateLimit: () => Promise.reject(new Error('raw Redis failure')),
      delete: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
      touch: () => Promise.resolve(null),
    } as ProviderConfigStore;

    await expect(
      enforceProviderConfigRateLimit(
        new Request('https://convergene.example/api/provider-config'),
        store,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_CONFIG_UNAVAILABLE' });
  });
});
