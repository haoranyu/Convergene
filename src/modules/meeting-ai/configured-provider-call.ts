import 'server-only';

import type { z } from 'zod';

import type { ProviderId } from '../provider-config';
import type {
  ProviderConfigPreload,
  ResolvedStoredProviderConfig,
} from '../provider-config/server';
import { runStructuredProviderCall, type StructuredProviderCallOptions } from './provider-adapter';

interface StoredProviderConfigService {
  markNeedsReconfiguration(provider: ProviderId, credentialRevision: string): Promise<void>;
  resolve(preload?: ProviderConfigPreload): Promise<ResolvedStoredProviderConfig>;
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
  preload?: ProviderConfigPreload,
): Promise<ConfiguredProviderCaller> {
  const config = await service.resolve(preload);
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
