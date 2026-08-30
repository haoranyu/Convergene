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
  encryptionKeyId,
  encryptCredential,
  createProviderConfigRevision,
  providerConfigKey,
  providerConfigTtlSeconds,
  toEncryptedProviderConfig,
  toEncryptedProviderCredential,
  type EncryptedProviderConfig,
  type ProviderConfigTouch,
  type ProviderConfigWrite,
  type ProviderConfigStore,
} from './server';
import type { ProviderId } from './model';

class MemoryProviderConfigStore implements ProviderConfigStore {
  readonly records = new Map<string, EncryptedProviderConfig>();
  readonly touched: Array<{
    key: string;
    lastUsedAt: string;
    provider: ProviderId;
    ttlSeconds: number;
  }> = [];
  readonly rateCounts = new Map<string, number>();

  async compareAndSet(key: string, write: ProviderConfigWrite): Promise<boolean> {
    const current = this.records.get(key);
    const matches =
      (write.expectation.state === 'MISSING' && current === undefined) ||
      (write.expectation.state === 'LEGACY' && current?.version === 1) ||
      (write.expectation.state === 'INVALID' && current?.version === 1) ||
      (write.expectation.state === 'V2' &&
        current?.version === 2 &&
        current.revision === write.expectation.revision);
    if (!matches) return false;
    this.records.set(key, write.record);
    return true;
  }

  consumeRateLimit(key: string): Promise<number> {
    const count = (this.rateCounts.get(key) ?? 0) + 1;
    this.rateCounts.set(key, count);
    return Promise.resolve(count);
  }

  consumeRateLimitAndReadConfig(
    input: Parameters<ProviderConfigStore['consumeRateLimitAndReadConfig']>[0],
  ): Promise<{ count: number; record: unknown | null }> {
    const record = input.session ? this.records.get(input.session.providerConfigKey) : undefined;
    const rateKey = record ? input.session!.rateLimitKey : input.clientRateLimitKey;
    const count = (this.rateCounts.get(rateKey) ?? 0) + 1;
    this.rateCounts.set(rateKey, count);
    return Promise.resolve({
      count,
      record: count <= input.limit && record ? structuredClone(record) : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.records.get(key) ?? null);
  }

  has(key: string): Promise<boolean> {
    return Promise.resolve(this.records.has(key));
  }

  touch(key: string, touch: ProviderConfigTouch): Promise<unknown | null> {
    const { credentialRevision, lastUsedAt, nextRecordRevision, provider, ttlSeconds } = touch;
    this.touched.push({ key, lastUsedAt, provider, ttlSeconds });
    const current = this.records.get(key);
    if (!current) {
      return Promise.resolve(null);
    }
    if (current.version !== 2 || !current.providers[provider]) {
      return Promise.reject(new Error('provider credential not found'));
    }
    const credential = current.providers[provider];
    if (current.activeProvider !== provider || credential.revision !== credentialRevision) {
      return Promise.resolve(current);
    }
    const persistedLastUsedAt =
      lastUsedAt > credential.lastUsedAt ? lastUsedAt : credential.lastUsedAt;
    const updated = toEncryptedProviderConfig(
      current.activeProvider,
      {
        ...current.providers,
        [provider]: { ...credential, lastUsedAt: persistedLastUsedAt },
      },
      nextRecordRevision,
    );
    this.records.set(key, updated);
    return Promise.resolve(updated);
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
const providerModelMappings = {
  SILICONFLOW: {
    fast: 'Qwen/Qwen3.5-4B',
    grill: 'deepseek-ai/DeepSeek-V4-Flash',
    report: 'deepseek-ai/DeepSeek-V4-Flash',
  },
  STEPFUN: {
    fast: 'step-3.5-flash-2603',
    grill: 'step-3.5-flash-2603',
    report: 'step-3.5-flash-2603',
  },
} as const;

describe('provider configuration service', () => {
  it('retains both provider credentials and resolves the explicitly selected provider', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn().mockImplementation(({ provider }) =>
        Promise.resolve({
          models:
            provider === 'STEPFUN'
              ? {
                  fast: 'step-3.5-flash-2603',
                  grill: 'step-3.5-flash-2603',
                  report: 'step-3.5-flash-2603',
                }
              : {
                  fast: 'Qwen/Qwen3.5-4B',
                  grill: 'deepseek-ai/DeepSeek-V4-Flash',
                  report: 'deepseek-ai/DeepSeek-V4-Flash',
                },
          provider,
        }),
      ),
    });

    await service.save({ apiKey: 'stepfun-secret', provider: 'STEPFUN' });
    await service.save({ apiKey: 'siliconflow-secret', provider: 'SILICONFLOW' });

    await service.setActiveProvider('STEPFUN');
    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: 'stepfun-secret',
      provider: 'STEPFUN',
    });

    await service.setActiveProvider('SILICONFLOW');
    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: 'siliconflow-secret',
      provider: 'SILICONFLOW',
    });
  });

  it('retains both providers when SiliconFlow is saved first and restores the active provider', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi
        .fn()
        .mockImplementation(({ provider }) =>
          Promise.resolve({ models: providerModelMappings[provider as ProviderId], provider }),
        ),
    });

    await service.save({ apiKey: 'siliconflow-secret', provider: 'SILICONFLOW' });
    await service.save({ apiKey: 'stepfun-secret', provider: 'STEPFUN' });
    await service.setActiveProvider('SILICONFLOW');

    await expect(service.getStatus()).resolves.toMatchObject({
      activeProvider: 'SILICONFLOW',
      configured: true,
      providers: {
        SILICONFLOW: { state: 'AVAILABLE' },
        STEPFUN: { state: 'AVAILABLE' },
      },
    });
    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: 'siliconflow-secret',
      provider: 'SILICONFLOW',
    });
  });

  it('does not alter either stored credential when a later connection test fails', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const testConnection = vi
      .fn()
      .mockImplementation(({ provider }) =>
        Promise.resolve({ models: providerModelMappings[provider as ProviderId], provider }),
      );
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      session,
      store,
      testConnection,
    });
    await service.save({ apiKey: 'stepfun-secret', provider: 'STEPFUN' });
    await service.save({ apiKey: 'siliconflow-secret', provider: 'SILICONFLOW' });
    const key = providerConfigKey(sessionId);
    const before = structuredClone(store.records.get(key));
    testConnection.mockRejectedValueOnce(new ProviderConnectionError('PROVIDER_AUTH_FAILED'));

    await expect(
      service.save({ apiKey: 'rejected-replacement', provider: 'STEPFUN' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    expect(store.records.get(key)).toEqual(before);
  });

  it('reconfigures one provider without changing the other credential or creation timestamp', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    let currentNow = fixedNow;
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => currentNow,
      session,
      store,
      testConnection: vi
        .fn()
        .mockImplementation(({ provider }) =>
          Promise.resolve({ models: providerModelMappings[provider as ProviderId], provider }),
        ),
    });
    await service.save({ apiKey: 'stepfun-secret', provider: 'STEPFUN' });
    currentNow = new Date('2026-08-29T02:00:00.000Z');
    await service.save({ apiKey: 'siliconflow-secret', provider: 'SILICONFLOW' });
    const key = providerConfigKey(sessionId);
    const before = store.records.get(key);
    const stepFunBefore = before?.version === 2 ? structuredClone(before.providers.STEPFUN) : null;

    currentNow = new Date('2026-08-29T03:00:00.000Z');
    await service.save({ apiKey: 'replacement-siliconflow-secret', provider: 'SILICONFLOW' });

    const after = store.records.get(key);
    expect(after?.version).toBe(2);
    expect(after?.version === 2 ? after.providers.STEPFUN : null).toEqual(stepFunBefore);
    expect(after?.version === 2 ? after.providers.SILICONFLOW?.createdAt : undefined).toBe(
      '2026-08-29T02:00:00.000Z',
    );
  });

  it('merges concurrent provider updates without losing either credential', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const dependencies = {
      createSessionId: () => sessionId,
      encryptionSecret,
      session,
      store,
      testConnection: vi
        .fn()
        .mockImplementation(({ provider }) =>
          Promise.resolve({ models: providerModelMappings[provider as ProviderId], provider }),
        ),
    };
    const firstService = createProviderConfigService(dependencies);
    const secondService = createProviderConfigService(dependencies);
    await firstService.save({ apiKey: 'original-stepfun-secret', provider: 'STEPFUN' });

    const originalGet = store.get.bind(store);
    let arrivals = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const getSpy = vi.spyOn(store, 'get').mockImplementation(async (key) => {
      const snapshot = structuredClone(await originalGet(key));
      arrivals += 1;
      if (arrivals === 2) releaseBarrier();
      await barrier;
      return snapshot;
    });

    await Promise.all([
      firstService.save({ apiKey: 'replacement-stepfun-secret', provider: 'STEPFUN' }),
      secondService.save({ apiKey: 'siliconflow-secret', provider: 'SILICONFLOW' }),
    ]);
    getSpy.mockRestore();

    await firstService.setActiveProvider('STEPFUN');
    await expect(firstService.resolve()).resolves.toMatchObject({
      apiKey: 'replacement-stepfun-secret',
      provider: 'STEPFUN',
    });
    await firstService.setActiveProvider('SILICONFLOW');
    await expect(firstService.resolve()).resolves.toMatchObject({
      apiKey: 'siliconflow-secret',
      provider: 'SILICONFLOW',
    });
  });

  it('marks only the provider with a confirmed credential rejection', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      session,
      store,
      testConnection: vi
        .fn()
        .mockImplementation(({ provider }) =>
          Promise.resolve({ models: providerModelMappings[provider as ProviderId], provider }),
        ),
    });
    await service.save({ apiKey: 'stepfun-secret', provider: 'STEPFUN' });
    await service.save({ apiKey: 'siliconflow-secret', provider: 'SILICONFLOW' });

    const rejectedConfig = await service.resolve();
    await service.markNeedsReconfiguration('SILICONFLOW', rejectedConfig.credentialRevision);

    await expect(service.getStatus()).resolves.toMatchObject({
      activeProvider: 'SILICONFLOW',
      providers: {
        SILICONFLOW: { state: 'NEEDS_RECONFIGURATION' },
        STEPFUN: { state: 'AVAILABLE' },
      },
    });
    await expect(service.resolve()).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    await service.setActiveProvider('STEPFUN');
    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: 'stepfun-secret',
      provider: 'STEPFUN',
    });
  });

  it('ignores a late authentication rejection from a replaced credential', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      session,
      store,
      testConnection: vi
        .fn()
        .mockImplementation(({ provider }) =>
          Promise.resolve({ models: providerModelMappings[provider as ProviderId], provider }),
        ),
    });
    await service.save({ apiKey: 'old-stepfun-secret', provider: 'STEPFUN' });
    const oldConfig = (await service.resolve()) as Awaited<ReturnType<typeof service.resolve>> & {
      credentialRevision: string;
    };

    await service.save({ apiKey: 'new-stepfun-secret', provider: 'STEPFUN' });
    await service.markNeedsReconfiguration('STEPFUN', oldConfig.credentialRevision);

    await expect(service.getStatus()).resolves.toMatchObject({
      providers: { STEPFUN: { state: 'AVAILABLE' } },
    });
    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: 'new-stepfun-secret',
      provider: 'STEPFUN',
    });
  });

  it('migrates a valid v1 record without asking for the key again', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession(sessionId);
    const envelope = encryptCredential('legacy-stepfun-secret', encryptionSecret);
    const legacyEnvelope = {
      authTag: envelope.authTag,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      version: envelope.version,
    };
    store.records.set(providerConfigKey(sessionId), {
      ...legacyEnvelope,
      createdAt: fixedNow.toISOString(),
      lastUsedAt: fixedNow.toISOString(),
      provider: 'STEPFUN',
    });
    const service = createProviderConfigService({
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn(),
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      activeProvider: 'STEPFUN',
      providers: { STEPFUN: { state: 'AVAILABLE' } },
    });
    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: 'legacy-stepfun-secret',
      provider: 'STEPFUN',
    });
    expect(store.records.get(providerConfigKey(sessionId))).toMatchObject({
      activeProvider: 'STEPFUN',
      providers: {
        STEPFUN: { keyId: encryptionKeyId(encryptionSecret) },
      },
      version: 2,
    });
  });

  it('re-encrypts a previous-key record with the current key during status recovery', async () => {
    const previousSecret = randomBytes(32).toString('base64');
    const currentSecret = randomBytes(32).toString('base64');
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession(sessionId);
    store.records.set(
      providerConfigKey(sessionId),
      toEncryptedProviderConfig('SILICONFLOW', {
        SILICONFLOW: toEncryptedProviderCredential(
          encryptCredential('rotated-siliconflow-secret', previousSecret),
          fixedNow.toISOString(),
        ),
      }),
    );
    const service = createProviderConfigService({
      encryptionSecret: currentSecret,
      now: () => fixedNow,
      previousEncryptionSecrets: [previousSecret],
      session,
      store,
      testConnection: vi.fn(),
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      activeProvider: 'SILICONFLOW',
      providers: { SILICONFLOW: { state: 'AVAILABLE' } },
    });
    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: 'rotated-siliconflow-secret',
      provider: 'SILICONFLOW',
    });
    expect(store.records.get(providerConfigKey(sessionId))).toMatchObject({
      providers: { SILICONFLOW: { keyId: encryptionKeyId(currentSecret) } },
    });
  });

  it('tests before saving an encrypted record and never returns the plaintext key', async () => {
    const store = new MemoryProviderConfigStore();
    const session = createMemorySession();
    const sessionId = createProviderSessionId();
    const testConnection = vi.fn().mockResolvedValue({
      models: {
        fast: 'step-3.5-flash-2603',
        grill: 'step-3.5-flash-2603',
        report: 'step-3.5-flash-2603',
      },
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
      activeProvider: 'STEPFUN',
      configured: true,
      providers: {
        SILICONFLOW: null,
        STEPFUN: { keyHint: '••••••••', provider: 'STEPFUN', state: 'AVAILABLE' },
      },
    });
  });

  it('replaces a forged session cookie that has no backing record', async () => {
    const store = new MemoryProviderConfigStore();
    const forgedSessionId = createProviderSessionId();
    const createdSessionId = createProviderSessionId();
    const session = createMemorySession(forgedSessionId);
    const service = createProviderConfigService({
      createSessionId: () => createdSessionId,
      encryptionSecret,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: {
          fast: 'step-3.5-flash-2603',
          grill: 'step-3.5-flash-2603',
          report: 'step-3.5-flash-2603',
        },
        provider: 'STEPFUN',
      }),
    });

    await service.save(input);

    expect(session.values).toEqual([createdSessionId]);
    expect(store.records.has(providerConfigKey(forgedSessionId))).toBe(false);
    expect(store.records.has(providerConfigKey(createdSessionId))).toBe(true);
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
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn(),
    });
    await service.save(input);
    session.values.length = 0;
    store.touched.length = 0;

    const summary = await service.getStatus();

    expect(summary).toMatchObject({
      activeProvider: 'STEPFUN',
      configured: true,
      providers: { STEPFUN: { keyHint: '••••••••' } },
    });
    expect(store.touched).toEqual([
      {
        key: providerConfigKey(sessionId),
        lastUsedAt: fixedNow.toISOString(),
        provider: 'STEPFUN',
        ttlSeconds: providerConfigTtlSeconds,
      },
    ]);
    expect(session.values).toEqual([sessionId]);
  });

  it('does not materialize plaintext during status reads and decrypts only for AI resolution', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession(sessionId);
    const savingService = createProviderConfigService({
      encryptionSecret,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: {
          fast: 'step-3.5-flash-2603',
          grill: 'step-3.5-flash-2603',
          report: 'step-3.5-flash-2603',
        },
        provider: 'STEPFUN',
      }),
    });
    await savingService.save(input);
    const serviceWithRotatedSecret = createProviderConfigService({
      encryptionSecret: randomBytes(32).toString('base64'),
      session,
      store,
      testConnection: vi.fn(),
    });

    await expect(serviceWithRotatedSecret.getStatus()).resolves.toMatchObject({
      activeProvider: 'STEPFUN',
      configured: true,
      providers: { STEPFUN: { state: 'NEEDS_RECONFIGURATION' } },
    });
    await expect(serviceWithRotatedSecret.resolve()).rejects.toMatchObject({
      code: 'PROVIDER_CONFIG_INVALID',
    });
  });

  it('keeps lastUsedAt monotonic when touches arrive out of order', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: {
          fast: 'step-3.5-flash-2603',
          grill: 'step-3.5-flash-2603',
          report: 'step-3.5-flash-2603',
        },
        provider: 'STEPFUN',
      }),
    });
    await service.save(input);
    const key = providerConfigKey(sessionId);
    const laterTimestamp = '2026-08-29T02:00:00.000Z';

    const savedRecord = store.records.get(key);
    const credentialRevision =
      savedRecord?.version === 2 ? savedRecord.providers.STEPFUN?.revision : undefined;
    expect(credentialRevision).toBeDefined();
    await store.touch(key, {
      credentialRevision: credentialRevision!,
      lastUsedAt: laterTimestamp,
      nextRecordRevision: createProviderConfigRevision(),
      provider: 'STEPFUN',
      ttlSeconds: providerConfigTtlSeconds,
    });
    await store.touch(key, {
      credentialRevision: credentialRevision!,
      lastUsedAt: fixedNow.toISOString(),
      nextRecordRevision: createProviderConfigRevision(),
      provider: 'STEPFUN',
      ttlSeconds: providerConfigTtlSeconds,
    });
    const record = store.records.get(key);
    expect(record?.version).toBe(2);
    expect(record?.version === 2 ? record.providers.STEPFUN?.lastUsedAt : undefined).toBe(
      laterTimestamp,
    );
  });

  it('rejects a malformed encrypted record without treating it as missing', async () => {
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
      testConnection: vi.fn().mockResolvedValue({
        models: {
          fast: 'step-3.5-flash-2603',
          grill: 'step-3.5-flash-2603',
          report: 'step-3.5-flash-2603',
        },
        provider: 'STEPFUN',
      }),
    });

    await expect(service.getStatus()).rejects.toMatchObject({
      code: 'PROVIDER_CONFIG_INVALID',
    });
    expect(store.touched).toHaveLength(0);

    await expect(service.save(input)).resolves.toMatchObject({
      activeProvider: 'STEPFUN',
      configured: true,
      providers: { STEPFUN: { provider: 'STEPFUN', state: 'AVAILABLE' } },
    });
    expect(JSON.stringify(store.records.get(providerConfigKey(sessionId)))).not.toContain(
      input.apiKey,
    );
  });

  it('resolves plaintext only in request memory and renews the sliding TTL', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: {
          fast: 'step-3.5-flash-2603',
          grill: 'step-3.5-flash-2603',
          report: 'step-3.5-flash-2603',
        },
        provider: 'STEPFUN',
      }),
    });
    await service.save(input);
    store.touched.length = 0;

    await expect(service.resolve()).resolves.toMatchObject({
      apiKey: input.apiKey,
      provider: 'STEPFUN',
    });
    expect(store.touched).toEqual([
      {
        key: providerConfigKey(sessionId),
        lastUsedAt: expect.any(String),
        provider: 'STEPFUN',
        ttlSeconds: providerConfigTtlSeconds,
      },
    ]);
  });

  it('resolves a rate-limit preload without a second store read', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: providerModelMappings.STEPFUN,
        provider: 'STEPFUN',
      }),
    });
    await service.save(input);
    const key = providerConfigKey(sessionId);
    const record = structuredClone(store.records.get(key));
    const get = vi.spyOn(store, 'get');
    store.touched.length = 0;

    await expect(service.resolve({ key, record })).resolves.toMatchObject({
      apiKey: input.apiKey,
      provider: 'STEPFUN',
    });

    expect(get).not.toHaveBeenCalled();
    expect(store.touched).toHaveLength(1);
  });

  it('re-reads a malformed or missing preload before rejecting configuration', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: providerModelMappings.STEPFUN,
        provider: 'STEPFUN',
      }),
    });
    await service.save(input);
    const key = providerConfigKey(sessionId);
    const get = vi.spyOn(store, 'get');

    await expect(service.resolve({ key, record: { version: 2 } })).resolves.toMatchObject({
      apiKey: input.apiKey,
      provider: 'STEPFUN',
    });
    await expect(service.resolve({ key, record: null })).resolves.toMatchObject({
      apiKey: input.apiKey,
      provider: 'STEPFUN',
    });

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('re-reads a stale rejected credential before attributing an auth failure', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: providerModelMappings.STEPFUN,
        provider: 'STEPFUN',
      }),
    });
    await service.save({ apiKey: 'old-stepfun-secret', provider: 'STEPFUN' });
    const resolved = await service.resolve();
    await service.markNeedsReconfiguration('STEPFUN', resolved.credentialRevision);
    const key = providerConfigKey(sessionId);
    const staleRejectedRecord = structuredClone(store.records.get(key));
    await service.save({ apiKey: 'replacement-stepfun-secret', provider: 'STEPFUN' });
    const get = vi.spyOn(store, 'get');

    await expect(service.resolve({ key, record: staleRejectedRecord })).resolves.toMatchObject({
      apiKey: 'replacement-stepfun-secret',
      provider: 'STEPFUN',
    });

    expect(get).toHaveBeenCalledOnce();
  });

  it('rejects an available preload when the current credential became unhealthy', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi.fn().mockResolvedValue({
        models: providerModelMappings.STEPFUN,
        provider: 'STEPFUN',
      }),
    });
    await service.save(input);
    const key = providerConfigKey(sessionId);
    const availablePreload = structuredClone(store.records.get(key));
    const resolved = await service.resolve();
    await service.markNeedsReconfiguration('STEPFUN', resolved.credentialRevision);
    const get = vi.spyOn(store, 'get');

    await expect(service.resolve({ key, record: availablePreload })).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_FAILED',
    });

    expect(get).toHaveBeenCalledOnce();
  });

  it('re-reads after a preloaded credential loses the active-provider race', async () => {
    const store = new MemoryProviderConfigStore();
    const sessionId = createProviderSessionId();
    const session = createMemorySession();
    const service = createProviderConfigService({
      createSessionId: () => sessionId,
      encryptionSecret,
      now: () => fixedNow,
      session,
      store,
      testConnection: vi
        .fn()
        .mockImplementation(({ provider }) =>
          Promise.resolve({ models: providerModelMappings[provider as ProviderId], provider }),
        ),
    });
    await service.save({ apiKey: 'stepfun-secret', provider: 'STEPFUN' });
    const key = providerConfigKey(sessionId);
    const staleRecord = structuredClone(store.records.get(key));
    await service.save({ apiKey: 'siliconflow-secret', provider: 'SILICONFLOW' });
    const get = vi.spyOn(store, 'get');
    store.touched.length = 0;

    await expect(service.resolve({ key, record: staleRecord })).resolves.toMatchObject({
      apiKey: 'siliconflow-secret',
      provider: 'SILICONFLOW',
    });

    expect(get).toHaveBeenCalledOnce();
    expect(store.touched.map(({ provider }) => provider)).toEqual(['STEPFUN', 'SILICONFLOW']);
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
