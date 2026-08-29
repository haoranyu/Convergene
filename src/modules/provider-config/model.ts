import { z } from 'zod';

export const providerIds = ['STEPFUN', 'SILICONFLOW'] as const;
export const providerIdSchema = z.enum(providerIds);

export type ProviderId = z.infer<typeof providerIdSchema>;

export const providerConfigInputSchema = z
  .object({
    apiKey: z.string().trim().min(1).max(512).regex(/^\S+$/u),
    provider: providerIdSchema,
  })
  .strict();

export type ProviderConfigInput = z.infer<typeof providerConfigInputSchema>;

export interface ProviderModelMapping {
  fast: string;
  grill: string;
  report: string;
}

export type ProviderConfigSummary =
  | {
      configured: false;
      state: 'NOT_CONFIGURED';
    }
  | {
      configured: true;
      keyHint?: string;
      lastUsedAt: string;
      models: ProviderModelMapping;
      provider: ProviderId;
      state: 'AVAILABLE' | 'NEEDS_RECONFIGURATION';
    };

export type ProviderConfigErrorCode =
  | 'INPUT_INVALID'
  | 'ORIGIN_INVALID'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_CONFIG_INVALID'
  | 'PROVIDER_CONFIG_UNAVAILABLE'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED';

export type ProviderConfigApiResponse<Value> =
  { ok: true; value: Value } | { error: { code: ProviderConfigErrorCode }; ok: false };

export interface ProviderConnectionResult {
  models: ProviderModelMapping;
  provider: ProviderId;
}
