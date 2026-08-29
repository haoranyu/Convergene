import 'server-only';

import type { z } from 'zod';

import type { ProviderId } from '../provider-config';
import type { ResolvedStoredProviderConfig } from '../provider-config/server';
import { runStructuredProviderCall, type StructuredProviderCallOptions } from './provider-adapter';

interface StoredProviderConfigService {
  markNeedsReconfiguration(provider: ProviderId, credentialRevision: string): Promise<void>;
  resolve(): Promise<ResolvedStoredProviderConfig>;
}

type ProviderCallOptions<Schema extends z.ZodType> = Omit<
  StructuredProviderCallOptions<Schema>,
  'config' | 'onConfirmedAuthFailure'
>;

type ConfiguredProviderCallOptions<Schema extends z.ZodType> = ProviderCallOptions<Schema> & {
  service: StoredProviderConfigService;
};

export interface ConfiguredProviderCaller {
  <Schema extends z.ZodType>(options: ProviderCallOptions<Schema>): Promise<z.infer<Schema>>;
}

export async function resolveConfiguredProviderCaller(
  service: StoredProviderConfigService,
): Promise<ConfiguredProviderCaller> {
  const config = await service.resolve();
  return <Schema extends z.ZodType>(options: ProviderCallOptions<Schema>) =>
    runStructuredProviderCall({
      ...options,
      config,
      onConfirmedAuthFailure: (provider) =>
        service.markNeedsReconfiguration(provider, config.credentialRevision),
    });
}

export async function runConfiguredProviderCall<Schema extends z.ZodType>({
  service,
  ...options
}: ConfiguredProviderCallOptions<Schema>): Promise<z.infer<Schema>> {
  const callProvider = await resolveConfiguredProviderCaller(service);
  return callProvider(options);
}
