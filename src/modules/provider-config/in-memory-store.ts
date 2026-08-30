import 'server-only';

import type { EncryptedProviderConfig, ProviderConfigStore } from './store';
import { toEncryptedProviderConfig } from './store';

export class InMemoryProviderConfigStore implements ProviderConfigStore {
  private readonly records = new Map<string, EncryptedProviderConfig>();

  async compareAndSet(
    key: string,
    write: Parameters<ProviderConfigStore['compareAndSet']>[1],
  ): Promise<boolean> {
    const current = this.records.get(key);
    const matches =
      (write.expectation.state === 'MISSING' && current === undefined) ||
      (write.expectation.state === 'LEGACY' && current?.version === 1) ||
      (write.expectation.state === 'INVALID' && current?.version === 1) ||
      (write.expectation.state === 'V2' &&
        current?.version === 2 &&
        current.revision === write.expectation.revision);
    if (!matches) return false;
    this.records.set(key, structuredClone(write.record));
    return true;
  }

  consumeRateLimit(): Promise<number> {
    return Promise.resolve(1);
  }

  consumeRateLimitAndReadConfig(
    input: Parameters<ProviderConfigStore['consumeRateLimitAndReadConfig']>[0],
  ): ReturnType<ProviderConfigStore['consumeRateLimitAndReadConfig']> {
    const record = input.session ? this.records.get(input.session.providerConfigKey) : undefined;
    return Promise.resolve({
      count: 1,
      record: record ? structuredClone(record) : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  get(key: string): Promise<unknown> {
    const record = this.records.get(key);
    return Promise.resolve(record ? structuredClone(record) : null);
  }

  has(key: string): Promise<boolean> {
    return Promise.resolve(this.records.has(key));
  }

  touch(key: string, touch: Parameters<ProviderConfigStore['touch']>[1]): Promise<unknown | null> {
    const current = this.records.get(key);
    if (!current) return Promise.resolve(null);
    if (current.version !== 2) return Promise.reject(new Error('invalid provider configuration'));
    const credential = current.providers[touch.provider];
    if (!credential) return Promise.reject(new Error('provider credential not found'));
    if (
      current.activeProvider !== touch.provider ||
      credential.revision !== touch.credentialRevision
    ) {
      return Promise.resolve(structuredClone(current));
    }

    const updated = toEncryptedProviderConfig(
      current.activeProvider,
      {
        ...current.providers,
        [touch.provider]: {
          ...credential,
          lastUsedAt:
            touch.lastUsedAt > credential.lastUsedAt ? touch.lastUsedAt : credential.lastUsedAt,
        },
      },
      touch.nextRecordRevision,
    );
    this.records.set(key, updated);
    return Promise.resolve(structuredClone(updated));
  }
}

export function getE2EProviderConfigStore(): InMemoryProviderConfigStore {
  const scope = globalThis as typeof globalThis & {
    __convergeneE2EProviderConfigStore?: InMemoryProviderConfigStore;
  };
  scope.__convergeneE2EProviderConfigStore ??= new InMemoryProviderConfigStore();
  return scope.__convergeneE2EProviderConfigStore;
}
