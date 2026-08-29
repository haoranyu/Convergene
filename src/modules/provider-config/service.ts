import 'server-only';

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
  encryptedProviderConfigSchema,
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

async function readRecord(
  store: ProviderConfigStore,
  sessionId: string,
): Promise<EncryptedProviderConfig | null> {
  try {
    const value = await store.get(providerConfigKey(sessionId));
    if (value === null) {
      return null;
    }

    const parsed = encryptedProviderConfigSchema.safeParse(value);
    if (!parsed.success) {
      throw new ProviderConfigServiceError('PROVIDER_CONFIG_INVALID');
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof ProviderConfigServiceError) {
      throw error;
    }
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

      const requestedLastUsedAt = now().toISOString();
      let persistedLastUsedAt: string | null;
      try {
        persistedLastUsedAt = await store.touch(key, requestedLastUsedAt, providerConfigTtlSeconds);
        if (!persistedLastUsedAt) {
          session.clear();
          return { configured: false, state: 'NOT_CONFIGURED' };
        }
      } catch {
        throw unavailable();
      }

      const touchedRecord = { ...record, lastUsedAt: persistedLastUsedAt };
      session.set(sessionId);
      return availableSummary(touchedRecord);
    },

    async resolve(): Promise<ResolvedStoredProviderConfig> {
      const sessionId = parseProviderSessionId(session.get());
      if (!sessionId) {
        throw new ResolvedProviderConfigError('PROVIDER_NOT_CONFIGURED');
      }

      let record: EncryptedProviderConfig | null;
      try {
        record = await readRecord(store, sessionId);
      } catch (error) {
        if (
          error instanceof ProviderConfigServiceError &&
          error.code === 'PROVIDER_CONFIG_INVALID'
        ) {
          throw new ResolvedProviderConfigError('PROVIDER_CONFIG_INVALID');
        }
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
      const requestedLastUsedAt = now().toISOString();
      let persistedLastUsedAt: string | null;
      try {
        persistedLastUsedAt = await store.touch(
          providerConfigKey(sessionId),
          requestedLastUsedAt,
          providerConfigTtlSeconds,
        );
        if (!persistedLastUsedAt) {
          session.clear();
          throw new ResolvedProviderConfigError('PROVIDER_NOT_CONFIGURED');
        }
      } catch (error) {
        if (error instanceof ResolvedProviderConfigError) {
          throw error;
        }
        throw new ResolvedProviderConfigError('PROVIDER_CONFIG_UNAVAILABLE');
      }

      const touchedRecord = { ...record, lastUsedAt: persistedLastUsedAt };
      session.set(sessionId);
      return {
        apiKey,
        models: providerPresets[touchedRecord.provider].models,
        provider: touchedRecord.provider,
      };
    },

    async save(input: ProviderConfigInput, signal?: AbortSignal): Promise<ProviderConfigSummary> {
      await testConnection(input, signal);

      const existingSessionId = parseProviderSessionId(session.get());
      const timestamp = now().toISOString();
      let existingRecord: EncryptedProviderConfig | null = null;
      let sessionId: string;

      if (existingSessionId) {
        try {
          existingRecord = await readRecord(store, existingSessionId);
          sessionId = existingRecord ? existingSessionId : createSessionId();
        } catch (error) {
          if (
            !(error instanceof ProviderConfigServiceError) ||
            error.code !== 'PROVIDER_CONFIG_INVALID'
          ) {
            throw error;
          }
          sessionId = existingSessionId;
        }
      } else {
        sessionId = createSessionId();
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
