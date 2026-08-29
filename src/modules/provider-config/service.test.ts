import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { ProviderConnectionError } from './provider-connection';
import { createProviderSessionId, type ProviderSessionCookie } from './session';
import {
  createProviderConfigService,
  ProviderConfigServiceError,
  ResolvedProviderConfigError,
} from './service';
import {
  providerConfigKey,
  providerConfigTtlSeconds,
  type EncryptedProviderConfig,
  type ProviderConfigStore,
} from './store';

class MemoryProviderConfigStore implements ProviderConfigStore {
  readonly records = new Map<string, EncryptedProviderConfig>();
  readonly renewed: Array<{ key: string; ttlSeconds: number }> = [];
  readonly rateCounts = new Map<string, number>();

  consumeRateLimit(key: string): Promise<number> {
    const count = (this.rateCounts.get(key) ?? 0) + 1;
    this.rateCounts.set(key, count);
    return Promise.resolve(count);
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  get(key: string): Promise<EncryptedProviderConfig | null> {
    return Promise.resolve(this.records.get(key) ?? null);
  }

  renew(key: string, ttlSeconds: number): Promise<boolean> {
    this.renewed.push({ key, ttlSeconds });
    return Promise.resolve(this.records.has(key));
  }

  async set(key: string, value: EncryptedProviderConfig): Promise<void> {
    this.records.set(key, value);
  }
}

function createMemorySession(initialValue?: string) {
  let value = initialValue;
  const session: ProviderSessionCookie & { cleared: boolean; values: string[] } = {
    cleared: false,
    values: [],
    clear() {
      this.cleared = true;
      value = undefined;
    },
    get() {
      return value;
    },
    set(sessionId) {
      value = sessionId;
      this.values.push(sessionId);
    },
  };
  return session;
}

const encryptionSecret = randomBytes(32).toString('base64');
const input = { apiKey: 'test-only-provider-secret', provider: 'STEPFUN' as const };
const fixedNow = new Date('2026-08-29T01:00:00.000Z');

describe('provider configuration service', () => {
  it('tests before saving an encrypted record and never returns the plaintext key', async () => {
    const store = new MemoryProviderConfigStore();
    const session = createMemorySession();
    const sessionId = createProviderSessionId();
    const testConnection = vi.fn().mockResolvedValue({
      models: { fast: 'step-3.7-flash', grill: 'step-3.7-flash', report: 'step-3.7-flash' },
      provider: 'STEPFUN',
    });
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection,
    });

    const summary = await service.save(input);
    const savedRecord = store.records.get(providerConfigKey(sessionId));

    expect(testConnection).toHaveBeenCalledWith(input, undefined);
    expect(session.values).toEqual([sessionId]);
    expect(savedRecord).toBeDefined();
    expect(JSON.stringify(savedRecord)).not.toContain(input.apiKey);
    expect(JSON.stringify(summary)).not.toContain(input.apiKey);
    expect(summary).toMatchObject({
      configured: true,
      keyHint: '••••••••',
      provider: 'STEPFUN',
      state: 'AVAILABLE',
    });
  });

  it('does not create or overwrite a valid record when the provider test fails', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession(sessionId);
    const oldRecord = {
      authTag: 'old-auth-tag',
      ciphertext: 'old-ciphertext',
      createdAt: fixedNow.toISOString(),
      iv: 'old-iv',
      lastUsedAt: fixedNow.toISOString(),
      provider: 'STEPFUN' as const,
      version: 1 as const,
    };
    store.records.set(providerConfigKey(sessionId), oldRecord);
    const service = createProviderConfigService({
      encryptionSecret,
      session,
      store,
      testConnection: () => Promise.reject(new ProviderConnectionError('PROVIDER_AUTH_FAILED')),
    });

    await expect(service.save(input)).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    expect(store.records.get(providerConfigKey(sessionId))).toBe(oldRecord);
    expect(session.values).toHaveLength(0);
  });

  it('renews both storage and the anonymous session after a valid read', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession(sessionId);
    const service = createProviderConfigService({
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn(),
    });
    await service.save(input);
    session.values.length = 0;
    store.renewed.length = 0;

    const summary = await service.getStatus();

    expect(summary).toMatchObject({ configured: true, keyHint: '••••••••' });
    expect(store.renewed).toEqual([
      { key: providerConfigKey(sessionId), ttlSeconds: providerConfigTtlSeconds },
    ]);
    expect(session.values).toEqual([sessionId]);
  });

  it('returns a reconfiguration state without exposing a corrupted encrypted record', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession(sessionId);
    store.records.set(providerConfigKey(sessionId), {
      authTag: 'invalid',
      ciphertext: 'invalid',
      createdAt: fixedNow.toISOString(),
      iv: 'invalid',
      lastUsedAt: fixedNow.toISOString(),
      provider: 'SILICONFLOW',
      version: 1,
    });
    const service = createProviderConfigService({
      encryptionSecret,
      session,
      store,
      testConnection: vi.fn(),
    });

    expect(await service.getStatus()).toMatchObject({
      configured: true,
      keyHint: '••••••••',
      provider: 'SILICONFLOW',
      state: 'NEEDS_RECONFIGURATION',
    });
    expect(store.renewed).toHaveLength(0);
  });

  it('resolves plaintext only in request memory and renews the sliding TTL', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession(sessionId);
    const service = createProviderConfigService({
      encryptionSecret,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: { fast: 'step-3.7-flash', grill: 'step-3.7-flash', report: 'step-3.7-flash' },
        provider: 'STEPFUN',
      }),
    });
    await service.save(input);
    store.renewed.length = 0;

    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: input.apiKey,
      provider: 'STEPFUN',
    });
    expect(store.renewed).toEqual([
      { key: providerConfigKey(sessionId), ttlSeconds: providerConfigTtlSeconds },
    ]);
  });

  it('deletes provider state idempotently without receiving any meeting repository', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession(sessionId);
    const service = createProviderConfigService({
      encryptionSecret,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({ provider: 'STEPFUN' }),
    });
    await service.save(input);

    await expect(service.delete()).resolves.toEqual({
      configured: false,
      state: 'NOT_CONFIGURED',
    });
    await expect(service.delete()).resolves.toEqual({
      configured: false,
      state: 'NOT_CONFIGURED',
    });
    expect(store.records).toHaveLength(0);
    expect(session.cleared).toBe(true);
  });

  it('normalizes storage failures and missing configurations', async () => {
    const session = createMemorySession(createProviderSessionId());
    const store = new MemoryProviderConfigStore();
    const service = createProviderConfigService({
      encryptionSecret,
      session,
      store,
      testConnection: vi.fn(),
    });

    await expect(service.resolve()).rejects.toBeInstanceOf(ResolvedProviderConfigError);
    await expect(service.resolve()).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });

    session.set(createProviderSessionId());
    vi.spyOn(store, 'get').mockRejectedValueOnce(new Error('raw Redis detail'));
    await expect(service.getStatus()).rejects.toBeInstanceOf(ProviderConfigServiceError);
    await expect(
      createProviderConfigService({
        encryptionSecret,
        session: createMemorySession(createProviderSessionId()),
        store: Object.assign(new MemoryProviderConfigStore(), {
          get: () => Promise.reject(new Error('raw Redis detail')),
        }),
        testConnection: vi.fn(),
      }).getStatus(),
    ).rejects.toMatchObject({ code: 'PROVIDER_CONFIG_UNAVAILABLE' });
  });
});
