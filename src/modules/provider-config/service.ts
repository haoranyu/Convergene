import 'server-only';

import {
  createEncryptionKeyring,
  decryptCredential,
  encryptCredential,
  type EncryptionKeyring,
} from './credential-crypto';
import type {
  ProviderConfigErrorCode,
  ProviderConfigInput,
  ProviderConfigSummary,
  ProviderConnectionResult,
  ProviderCredentialSummary,
  ProviderId,
} from './model';
import { providerIds } from './model';
import { providerPresets } from './presets';
import {
  createProviderSessionId,
  parseProviderSessionId,
  type ProviderSessionCookie,
} from './session';
import {
  encryptedProviderConfigSchema,
  encryptedProviderConfigV2Schema,
  createProviderConfigRevision,
  providerConfigKey,
  providerConfigTtlSeconds,
  toEncryptedProviderConfig,
  toEncryptedProviderCredential,
  type EncryptedProviderConfig,
  type EncryptedProviderConfigV2,
  type EncryptedProviderCredential,
  type LegacyEncryptedProviderConfig,
  type ProviderConfigWriteExpectation,
  type ProviderConfigStore,
} from './store';

const constantKeyHint = '••••••••';
const maximumWriteAttempts = 8;

export class ProviderConfigServiceError extends Error {
  constructor(readonly code: ProviderConfigErrorCode) {
    super(code);
    this.name = 'ProviderConfigServiceError';
  }
}

export class ResolvedProviderConfigError extends Error {
  constructor(
    readonly code:
      | 'PROVIDER_AUTH_FAILED'
      | 'PROVIDER_CONFIG_INVALID'
      | 'PROVIDER_CONFIG_UNAVAILABLE'
      | 'PROVIDER_NOT_CONFIGURED',
  ) {
    super(code);
    this.name = 'ResolvedProviderConfigError';
  }
}

export interface ResolvedStoredProviderConfig {
  apiKey: string;
  credentialRevision: string;
  models: (typeof providerPresets)[keyof typeof providerPresets]['models'];
  provider: keyof typeof providerPresets;
}

export interface ProviderConfigServiceDependencies {
  createSessionId?: () => string;
  encryptionSecret: string;
  now?: () => Date;
  previousEncryptionSecrets?: readonly string[];
  session: ProviderSessionCookie;
  store: ProviderConfigStore;
  testConnection(
    input: ProviderConfigInput,
    signal?: AbortSignal,
  ): Promise<ProviderConnectionResult>;
}

interface NormalizedRecord {
  changed: boolean;
  record: EncryptedProviderConfigV2;
}

function unavailable(): ProviderConfigServiceError {
  return new ProviderConfigServiceError('PROVIDER_CONFIG_UNAVAILABLE');
}

function credentialState(
  credential: EncryptedProviderCredential,
  keyring: EncryptionKeyring,
): ProviderCredentialSummary['state'] {
  return credential.health === 'AVAILABLE' &&
    credential.keyId !== 'legacy' &&
    keyring.keys.has(credential.keyId)
    ? 'AVAILABLE'
    : 'NEEDS_RECONFIGURATION';
}

function availableSummary(
  record: EncryptedProviderConfigV2,
  keyring: EncryptionKeyring,
): ProviderConfigSummary {
  const providers = Object.fromEntries(
    providerIds.map((provider) => {
      const credential = record.providers[provider];
      return [
        provider,
        credential
          ? {
              createdAt: credential.createdAt,
              keyHint: constantKeyHint,
              lastUsedAt: credential.lastUsedAt,
              models: providerPresets[provider].models,
              provider,
              state: credentialState(credential, keyring),
            }
          : null,
      ];
    }),
  ) as Record<ProviderId, ProviderCredentialSummary | null>;

  return {
    activeProvider: record.activeProvider,
    configured: true,
    providers,
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

function legacyCredential(
  record: LegacyEncryptedProviderConfig,
  keyring: EncryptionKeyring,
): EncryptedProviderCredential {
  for (const key of keyring.keys.values()) {
    try {
      const plaintext = decryptCredential(record, key.secret);
      return toEncryptedProviderCredential(
        encryptCredential(plaintext, keyring.current.secret),
        record.lastUsedAt,
        record.createdAt,
      );
    } catch {
      // A v1 record has no key id, so each configured key must be tried without exposing failures.
    }
  }

  return {
    authTag: record.authTag,
    ciphertext: record.ciphertext,
    createdAt: record.createdAt,
    health: 'AVAILABLE',
    iv: record.iv,
    keyId: 'legacy',
    lastUsedAt: record.lastUsedAt,
    revision: createProviderConfigRevision(),
    version: 1,
  };
}

function rotateCredential(
  credential: EncryptedProviderCredential,
  keyring: EncryptionKeyring,
): { changed: boolean; credential: EncryptedProviderCredential } {
  if (credential.keyId === keyring.current.id) {
    return { changed: false, credential };
  }

  const candidateKeys =
    credential.keyId === 'legacy'
      ? [...keyring.keys.values()]
      : [keyring.keys.get(credential.keyId)].filter((key) => key !== undefined);

  if (candidateKeys.length === 0) {
    return { changed: false, credential };
  }

  for (const key of candidateKeys) {
    try {
      const envelope =
        credential.keyId === 'legacy'
          ? {
              authTag: credential.authTag,
              ciphertext: credential.ciphertext,
              iv: credential.iv,
              version: credential.version,
            }
          : credential;
      const plaintext = decryptCredential(envelope, key.secret);
      return {
        changed: true,
        credential: {
          ...toEncryptedProviderCredential(
            encryptCredential(plaintext, keyring.current.secret),
            credential.lastUsedAt,
            credential.createdAt,
            credential.revision,
          ),
          health: credential.health === 'DECRYPTION_FAILED' ? 'AVAILABLE' : credential.health,
        },
      };
    } catch {
      // Try the next known key for legacy records. No key or plaintext is logged.
    }
  }

  return {
    changed: credential.health !== 'DECRYPTION_FAILED',
    credential: { ...credential, health: 'DECRYPTION_FAILED' },
  };
}

function normalizeRecord(
  record: EncryptedProviderConfig,
  keyring: EncryptionKeyring,
): NormalizedRecord {
  if (record.version === 1) {
    return {
      changed: true,
      record: toEncryptedProviderConfig(record.provider, {
        [record.provider]: legacyCredential(record, keyring),
      }),
    };
  }

  let changed = false;
  const providers: Partial<Record<ProviderId, EncryptedProviderCredential>> = {};
  for (const provider of providerIds) {
    const credential = record.providers[provider];
    if (!credential) continue;
    const rotated = rotateCredential(credential, keyring);
    providers[provider] = rotated.credential;
    changed ||= rotated.changed;
  }

  return {
    changed,
    record: changed ? toEncryptedProviderConfig(record.activeProvider, providers) : record,
  };
}

async function compareAndSetRecord(
  store: ProviderConfigStore,
  sessionId: string,
  expectation: ProviderConfigWriteExpectation,
  record: EncryptedProviderConfigV2,
): Promise<boolean> {
  try {
    return await store.compareAndSet(providerConfigKey(sessionId), {
      expectation,
      record,
      ttlSeconds: providerConfigTtlSeconds,
    });
  } catch {
    throw unavailable();
  }
}

async function touchRecord(
  store: ProviderConfigStore,
  sessionId: string,
  provider: ProviderId,
  credentialRevision: string,
  lastUsedAt: string,
): Promise<EncryptedProviderConfigV2 | null> {
  let touched: unknown;
  try {
    touched = await store.touch(providerConfigKey(sessionId), {
      credentialRevision,
      lastUsedAt,
      nextRecordRevision: createProviderConfigRevision(),
      provider,
      ttlSeconds: providerConfigTtlSeconds,
    });
  } catch {
    throw unavailable();
  }
  if (touched === null) {
    return null;
  }

  const parsed = encryptedProviderConfigV2Schema.safeParse(touched);
  if (!parsed.success) {
    throw new ProviderConfigServiceError('PROVIDER_CONFIG_INVALID');
  }
  return parsed.data;
}

export function createProviderConfigService(dependencies: ProviderConfigServiceDependencies) {
  const {
    createSessionId = createProviderSessionId,
    encryptionSecret,
    now = () => new Date(),
    previousEncryptionSecrets = [],
    session,
    store,
    testConnection,
  } = dependencies;
  const keyring = createEncryptionKeyring(encryptionSecret, previousEncryptionSecrets);

  async function readNormalizedRecord(
    sessionId: string,
  ): Promise<EncryptedProviderConfigV2 | null> {
    for (let attempt = 0; attempt < maximumWriteAttempts; attempt += 1) {
      const storedRecord = await readRecord(store, sessionId);
      if (!storedRecord) return null;

      const normalized = normalizeRecord(storedRecord, keyring);
      if (!normalized.changed) {
        return normalized.record;
      }
      const expectation: ProviderConfigWriteExpectation =
        storedRecord.version === 1
          ? { state: 'LEGACY' }
          : { revision: storedRecord.revision, state: 'V2' };
      if (await compareAndSetRecord(store, sessionId, expectation, normalized.record)) {
        return normalized.record;
      }
    }

    throw unavailable();
  }

  async function updateRecord(
    sessionId: string,
    update: (current: EncryptedProviderConfigV2 | null) => EncryptedProviderConfigV2 | undefined,
  ): Promise<EncryptedProviderConfigV2 | null> {
    for (let attempt = 0; attempt < maximumWriteAttempts; attempt += 1) {
      const current = await readNormalizedRecord(sessionId);
      const next = update(current);
      if (next === undefined) {
        return current;
      }
      const expectation: ProviderConfigWriteExpectation = current
        ? { revision: current.revision, state: 'V2' }
        : { state: 'MISSING' };
      if (await compareAndSetRecord(store, sessionId, expectation, next)) {
        return next;
      }
    }

    throw unavailable();
  }

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

      for (let attempt = 0; attempt < maximumWriteAttempts; attempt += 1) {
        const record = await readNormalizedRecord(sessionId);
        if (!record) {
          session.clear();
          return { configured: false, state: 'NOT_CONFIGURED' };
        }
        const provider = record.activeProvider;
        const credential = record.providers[provider];
        if (!credential) {
          throw new ProviderConfigServiceError('PROVIDER_CONFIG_INVALID');
        }

        const touchedRecord = await touchRecord(
          store,
          sessionId,
          provider,
          credential.revision,
          now().toISOString(),
        );
        if (!touchedRecord) {
          session.clear();
          return { configured: false, state: 'NOT_CONFIGURED' };
        }
        if (
          touchedRecord.activeProvider !== provider ||
          touchedRecord.providers[provider]?.revision !== credential.revision
        ) {
          continue;
        }

        session.set(sessionId);
        return availableSummary(touchedRecord, keyring);
      }

      throw unavailable();
    },

    async markNeedsReconfiguration(
      provider: ProviderId,
      credentialRevision: string,
    ): Promise<void> {
      const sessionId = parseProviderSessionId(session.get());
      if (!sessionId) return;

      await updateRecord(sessionId, (record) => {
        const credential = record?.providers[provider];
        if (
          !record ||
          !credential ||
          credential.revision !== credentialRevision ||
          credential.health === 'AUTH_REJECTED'
        ) {
          return undefined;
        }

        return toEncryptedProviderConfig(record.activeProvider, {
          ...record.providers,
          [provider]: { ...credential, health: 'AUTH_REJECTED' },
        });
      });
      session.set(sessionId);
    },

    async resolve(): Promise<ResolvedStoredProviderConfig> {
      const sessionId = parseProviderSessionId(session.get());
      if (!sessionId) {
        throw new ResolvedProviderConfigError('PROVIDER_NOT_CONFIGURED');
      }

      for (let attempt = 0; attempt < maximumWriteAttempts; attempt += 1) {
        let record: EncryptedProviderConfigV2 | null;
        try {
          record = await readNormalizedRecord(sessionId);
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

        const provider = record.activeProvider;
        const credential = record.providers[provider];
        if (!credential) {
          throw new ResolvedProviderConfigError('PROVIDER_CONFIG_INVALID');
        }
        if (credential.health === 'AUTH_REJECTED') {
          throw new ResolvedProviderConfigError('PROVIDER_AUTH_FAILED');
        }
        const key = credential.keyId === 'legacy' ? undefined : keyring.keys.get(credential.keyId);
        if (!key || credential.health === 'DECRYPTION_FAILED') {
          throw new ResolvedProviderConfigError('PROVIDER_CONFIG_INVALID');
        }

        let apiKey: string;
        try {
          apiKey = decryptCredential(credential, key.secret);
        } catch {
          try {
            await updateRecord(sessionId, (current) => {
              const currentCredential = current?.providers[provider];
              if (
                !current ||
                !currentCredential ||
                currentCredential.revision !== credential.revision
              ) {
                return undefined;
              }
              return toEncryptedProviderConfig(current.activeProvider, {
                ...current.providers,
                [provider]: { ...currentCredential, health: 'DECRYPTION_FAILED' },
              });
            });
          } catch {
            throw new ResolvedProviderConfigError('PROVIDER_CONFIG_UNAVAILABLE');
          }
          throw new ResolvedProviderConfigError('PROVIDER_CONFIG_INVALID');
        }

        let touchedRecord: EncryptedProviderConfigV2 | null;
        try {
          touchedRecord = await touchRecord(
            store,
            sessionId,
            provider,
            credential.revision,
            now().toISOString(),
          );
        } catch {
          throw new ResolvedProviderConfigError('PROVIDER_CONFIG_UNAVAILABLE');
        }
        if (!touchedRecord) {
          session.clear();
          throw new ResolvedProviderConfigError('PROVIDER_NOT_CONFIGURED');
        }
        if (
          touchedRecord.activeProvider !== provider ||
          touchedRecord.providers[provider]?.revision !== credential.revision
        ) {
          continue;
        }

        session.set(sessionId);
        return {
          apiKey,
          credentialRevision: credential.revision,
          models: providerPresets[provider].models,
          provider,
        };
      }

      throw new ResolvedProviderConfigError('PROVIDER_CONFIG_UNAVAILABLE');
    },

    async save(input: ProviderConfigInput, signal?: AbortSignal): Promise<ProviderConfigSummary> {
      await testConnection(input, signal);

      const existingSessionId = parseProviderSessionId(session.get());
      const timestamp = now().toISOString();
      let sessionId: string;
      let replaceInvalidRecord = false;

      if (existingSessionId) {
        try {
          const existingRecord = await readNormalizedRecord(existingSessionId);
          sessionId = existingRecord ? existingSessionId : createSessionId();
        } catch (error) {
          if (
            !(error instanceof ProviderConfigServiceError) ||
            error.code !== 'PROVIDER_CONFIG_INVALID'
          ) {
            throw error;
          }
          sessionId = existingSessionId;
          replaceInvalidRecord = true;
        }
      } else {
        sessionId = createSessionId();
      }

      let replacementCredential: EncryptedProviderCredential;
      try {
        replacementCredential = toEncryptedProviderCredential(
          encryptCredential(input.apiKey, keyring.current.secret),
          timestamp,
        );
      } catch {
        throw unavailable();
      }

      if (replaceInvalidRecord) {
        const replacementRecord = toEncryptedProviderConfig(input.provider, {
          [input.provider]: replacementCredential,
        });
        if (await compareAndSetRecord(store, sessionId, { state: 'INVALID' }, replacementRecord)) {
          session.set(sessionId);
          return availableSummary(replacementRecord, keyring);
        }
      }

      const encryptedRecord = await updateRecord(sessionId, (current) => {
        const credential = {
          ...replacementCredential,
          createdAt: current?.providers[input.provider]?.createdAt ?? timestamp,
        };
        return toEncryptedProviderConfig(input.provider, {
          ...current?.providers,
          [input.provider]: credential,
        });
      });
      if (!encryptedRecord) {
        throw unavailable();
      }
      session.set(sessionId);
      return availableSummary(encryptedRecord, keyring);
    },

    async setActiveProvider(provider: ProviderId): Promise<ProviderConfigSummary> {
      const sessionId = parseProviderSessionId(session.get());
      if (!sessionId) {
        throw new ProviderConfigServiceError('PROVIDER_CONFIG_INVALID');
      }

      const updated = await updateRecord(sessionId, (record) => {
        const credential = record?.providers[provider];
        if (!record || !credential || credentialState(credential, keyring) !== 'AVAILABLE') {
          throw new ProviderConfigServiceError('PROVIDER_CONFIG_INVALID');
        }
        if (record.activeProvider === provider) {
          return undefined;
        }
        return toEncryptedProviderConfig(provider, record.providers);
      });
      if (!updated) {
        throw new ProviderConfigServiceError('PROVIDER_CONFIG_INVALID');
      }
      session.set(sessionId);
      return availableSummary(updated, keyring);
    },

    test(input: ProviderConfigInput, signal?: AbortSignal): Promise<ProviderConnectionResult> {
      return testConnection(input, signal);
    },
  };
}
