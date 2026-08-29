import { decryptCredential, encryptCredential } from './credential-crypto';
import type {
  ProviderConfigErrorCode,
  ProviderConfigInput,
  ProviderConfigSummary,
  ProviderConnectionResult,
} from './model';
import { providerPresets } from './presets';
import {
  createProviderSessionId,
  parseProviderSessionId,
  type ProviderSessionCookie,
} from './session';
import {
  providerConfigKey,
  providerConfigTtlSeconds,
  toEncryptedProviderConfig,
  type EncryptedProviderConfig,
  type ProviderConfigStore,
} from './store';

const constantKeyHint = '••••••••';

export class ProviderConfigServiceError extends Error {
  constructor(readonly code: ProviderConfigErrorCode) {
    super(code);
    this.name = 'ProviderConfigServiceError';
  }
}

export class ResolvedProviderConfigError extends Error {
  constructor(
    readonly code:
      'PROVIDER_CONFIG_INVALID' | 'PROVIDER_CONFIG_UNAVAILABLE' | 'PROVIDER_NOT_CONFIGURED',
  ) {
    super(code);
    this.name = 'ResolvedProviderConfigError';
  }
}

export interface ResolvedStoredProviderConfig {
  apiKey: string;
  models: (typeof providerPresets)[keyof typeof providerPresets]['models'];
  provider: keyof typeof providerPresets;
}

export interface ProviderConfigServiceDependencies {
  createSessionId?: () => string;
  encryptionSecret: string;
  now?: () => Date;
  session: ProviderSessionCookie;
  store: ProviderConfigStore;
  testConnection(
    input: ProviderConfigInput,
    signal?: AbortSignal,
  ): Promise<ProviderConnectionResult>;
}

function unavailable(): ProviderConfigServiceError {
  return new ProviderConfigServiceError('PROVIDER_CONFIG_UNAVAILABLE');
}

function availableSummary(record: EncryptedProviderConfig): ProviderConfigSummary {
  return {
    configured: true,
    keyHint: constantKeyHint,
    lastUsedAt: record.lastUsedAt,
    models: providerPresets[record.provider].models,
    provider: record.provider,
    state: 'AVAILABLE',
  };
}

function invalidSummary(record: EncryptedProviderConfig): ProviderConfigSummary {
  return {
    configured: true,
    keyHint: constantKeyHint,
    lastUsedAt: record.lastUsedAt,
    models: providerPresets[record.provider].models,
    provider: record.provider,
    state: 'NEEDS_RECONFIGURATION',
  };
}

function isEncryptedProviderConfig(value: unknown): value is EncryptedProviderConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Partial<EncryptedProviderConfig>;
  return (
    record.version === 1 &&
    (record.provider === 'STEPFUN' || record.provider === 'SILICONFLOW') &&
    typeof record.authTag === 'string' &&
    typeof record.ciphertext === 'string' &&
    typeof record.iv === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.lastUsedAt === 'string'
  );
}

async function readRecord(
  store: ProviderConfigStore,
  sessionId: string,
): Promise<EncryptedProviderConfig | null> {
  try {
    const value: unknown = await store.get(providerConfigKey(sessionId));
    return isEncryptedProviderConfig(value) ? value : null;
  } catch {
    throw unavailable();
  }
}

export function createProviderConfigService(dependencies: ProviderConfigServiceDependencies) {
  const {
    createSessionId = createProviderSessionId,
    encryptionSecret,
    now = () => new Date(),
    session,
    store,
    testConnection,
  } = dependencies;

  return {
    async delete(): Promise<ProviderConfigSummary> {
      const sessionId = parseProviderSessionId(session.get());
      if (!sessionId) {
        session.clear();
        return { configured: false, state: 'NOT_CONFIGURED' };
      }

      try {
        await store.delete(providerConfigKey(sessionId));
      } catch {
        throw unavailable();
      }

      session.clear();
      return { configured: false, state: 'NOT_CONFIGURED' };
    },

    async getStatus(): Promise<ProviderConfigSummary> {
      const sessionId = parseProviderSessionId(session.get());
      if (!sessionId) {
        return { configured: false, state: 'NOT_CONFIGURED' };
      }

      const key = providerConfigKey(sessionId);
      const record = await readRecord(store, sessionId);
      if (!record) {
        session.clear();
        return { configured: false, state: 'NOT_CONFIGURED' };
      }

      try {
        decryptCredential(record, encryptionSecret);
      } catch {
        return invalidSummary(record);
      }

      try {
        if (!(await store.renew(key, providerConfigTtlSeconds))) {
          session.clear();
          return { configured: false, state: 'NOT_CONFIGURED' };
        }
      } catch {
        throw unavailable();
      }

      session.set(sessionId);
      return availableSummary(record);
    },

    async resolve(): Promise<ResolvedStoredProviderConfig> {
      const sessionId = parseProviderSessionId(session.get());
      if (!sessionId) {
        throw new ResolvedProviderConfigError('PROVIDER_NOT_CONFIGURED');
      }

      let record: EncryptedProviderConfig | null;
      try {
        record = await readRecord(store, sessionId);
      } catch {
        throw new ResolvedProviderConfigError('PROVIDER_CONFIG_UNAVAILABLE');
      }
      if (!record) {
        session.clear();
        throw new ResolvedProviderConfigError('PROVIDER_NOT_CONFIGURED');
      }

      let apiKey: string;
      try {
        apiKey = decryptCredential(record, encryptionSecret);
      } catch {
        throw new ResolvedProviderConfigError('PROVIDER_CONFIG_INVALID');
      }

      try {
        if (!(await store.renew(providerConfigKey(sessionId), providerConfigTtlSeconds))) {
          session.clear();
          throw new ResolvedProviderConfigError('PROVIDER_NOT_CONFIGURED');
        }
      } catch (error) {
        if (error instanceof ResolvedProviderConfigError) {
          throw error;
        }
        throw new ResolvedProviderConfigError('PROVIDER_CONFIG_UNAVAILABLE');
      }

      session.set(sessionId);
      return { apiKey, models: providerPresets[record.provider].models, provider: record.provider };
    },

    async save(input: ProviderConfigInput, signal?: AbortSignal): Promise<ProviderConfigSummary> {
      await testConnection(input, signal);

      const existingSessionId = parseProviderSessionId(session.get());
      const sessionId = existingSessionId ?? createSessionId();
      const timestamp = now().toISOString();
      let existingRecord: EncryptedProviderConfig | null = null;

      if (existingSessionId) {
        existingRecord = await readRecord(store, existingSessionId);
      }

      let encryptedRecord: EncryptedProviderConfig;
      try {
        encryptedRecord = toEncryptedProviderConfig(
          encryptCredential(input.apiKey, encryptionSecret),
          input.provider,
          timestamp,
          existingRecord?.createdAt,
        );
      } catch {
        throw unavailable();
      }

      try {
        await store.set(providerConfigKey(sessionId), encryptedRecord, providerConfigTtlSeconds);
      } catch {
        throw unavailable();
      }

      session.set(sessionId);
      return availableSummary(encryptedRecord);
    },

    test(input: ProviderConfigInput, signal?: AbortSignal): Promise<ProviderConnectionResult> {
      return testConnection(input, signal);
    },
  };
}
