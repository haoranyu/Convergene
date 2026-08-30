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

export const providerSelectionInputSchema = z.object({ activeProvider: providerIdSchema }).strict();

export type ProviderSelectionInput = z.infer<typeof providerSelectionInputSchema>;

export const providerModelMappingSchema = z
  .object({
    fast: z.string().min(1).max(128),
    grill: z.string().min(1).max(128),
    report: z.string().min(1).max(128),
  })
  .strict();

export type ProviderModelMapping = z.infer<typeof providerModelMappingSchema>;

export const providerModelPresets = {
  SILICONFLOW: {
    fast: 'Pro/Qwen/Qwen2.5-7B-Instruct',
    grill: 'deepseek-ai/DeepSeek-V4-Flash',
    report: 'deepseek-ai/DeepSeek-V4-Flash',
  },
  STEPFUN: {
    fast: 'step-3.7-flash',
    grill: 'step-3.5-flash-2603',
    report: 'step-3.5-flash-2603',
  },
} as const satisfies Record<ProviderId, ProviderModelMapping>;

export interface ProviderCredentialSummary {
  createdAt: string;
  keyHint?: string;
  lastUsedAt: string;
  models: ProviderModelMapping;
  provider: ProviderId;
  state: 'AVAILABLE' | 'NEEDS_RECONFIGURATION';
}

export type ProviderConfigSummary =
  | {
      configured: false;
      state: 'NOT_CONFIGURED';
    }
  | {
      activeProvider: ProviderId;
      configured: true;
      providers: Record<ProviderId, ProviderCredentialSummary | null>;
    };

export type ProviderConfigErrorCode =
  | 'INPUT_INVALID'
  | 'ORIGIN_INVALID'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_ACCESS_RESTRICTED'
  | 'PROVIDER_CONFIG_INVALID'
  | 'PROVIDER_CONFIG_UNAVAILABLE'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED';

export const providerConfigErrorCodeSchema = z.enum([
  'INPUT_INVALID',
  'ORIGIN_INVALID',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_ACCESS_RESTRICTED',
  'PROVIDER_CONFIG_INVALID',
  'PROVIDER_CONFIG_UNAVAILABLE',
  'PROVIDER_MODEL_NOT_FOUND',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
] satisfies ProviderConfigErrorCode[]);

export const providerConfigSummarySchema = z.discriminatedUnion('configured', [
  z.object({ configured: z.literal(false), state: z.literal('NOT_CONFIGURED') }).strict(),
  z
    .object({
      activeProvider: providerIdSchema,
      configured: z.literal(true),
      providers: z
        .object({
          SILICONFLOW: z
            .object({
              createdAt: z.iso.datetime(),
              keyHint: z.literal('••••••••').optional(),
              lastUsedAt: z.iso.datetime(),
              models: providerModelMappingSchema,
              provider: z.literal('SILICONFLOW'),
              state: z.enum(['AVAILABLE', 'NEEDS_RECONFIGURATION']),
            })
            .strict()
            .nullable(),
          STEPFUN: z
            .object({
              createdAt: z.iso.datetime(),
              keyHint: z.literal('••••••••').optional(),
              lastUsedAt: z.iso.datetime(),
              models: providerModelMappingSchema,
              provider: z.literal('STEPFUN'),
              state: z.enum(['AVAILABLE', 'NEEDS_RECONFIGURATION']),
            })
            .strict()
            .nullable(),
        })
        .strict(),
    })
    .strict(),
]);

export const providerConnectionResultSchema = z
  .object({ models: providerModelMappingSchema, provider: providerIdSchema })
  .strict();

export function providerConfigApiResponseSchema<ValueSchema extends z.ZodType>(
  valueSchema: ValueSchema,
) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: valueSchema }).strict(),
    z
      .object({
        error: z.object({ code: providerConfigErrorCodeSchema }).strict(),
        ok: z.literal(false),
      })
      .strict(),
  ]);
}

export type ProviderConfigApiResponse<Value> =
  { ok: true; value: Value } | { error: { code: ProviderConfigErrorCode }; ok: false };

export interface ProviderConnectionResult {
  models: ProviderModelMapping;
  provider: ProviderId;
}
