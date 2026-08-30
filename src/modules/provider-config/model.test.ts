import { describe, expect, it } from 'vitest';

import {
  providerCapabilities,
  providerConfigInputSchema,
  providerConfigSummarySchema,
  providerModelPresets,
  providerSupportsRole,
} from './model';

describe('provider configuration input', () => {
  it('uses the Step Plan low-latency preset for fast structured output', () => {
    expect(providerModelPresets.STEPFUN).toEqual({
      fast: 'step-3.7-flash',
      grill: 'step-3.5-flash-2603',
      report: 'step-3.5-flash-2603',
    });
  });

  it('uses the production-validated SiliconFlow preset for fast structured output', () => {
    expect(providerModelPresets.SILICONFLOW).toEqual({
      fast: 'Qwen/Qwen3.5-4B',
      grill: 'deepseek-ai/DeepSeek-V4-Flash',
      report: 'deepseek-ai/DeepSeek-V4-Flash',
    });
  });

  it('publishes the exact runtime capability matrix for every provider role', () => {
    expect(providerCapabilities).toEqual({
      SILICONFLOW: {
        fast: 'AVAILABLE',
        grill: 'AVAILABLE',
        report: 'UNAVAILABLE',
      },
      STEPFUN: {
        fast: 'UNAVAILABLE',
        grill: 'AVAILABLE',
        report: 'UNAVAILABLE',
      },
    });

    expect(providerSupportsRole('SILICONFLOW', 'fast')).toBe(true);
    expect(providerSupportsRole('SILICONFLOW', 'grill')).toBe(true);
    expect(providerSupportsRole('SILICONFLOW', 'report')).toBe(false);
    expect(providerSupportsRole('STEPFUN', 'fast')).toBe(false);
    expect(providerSupportsRole('STEPFUN', 'grill')).toBe(true);
    expect(providerSupportsRole('STEPFUN', 'report')).toBe(false);
  });

  it('requires the capability matrix on every configured credential summary', () => {
    const summary = {
      activeProvider: 'SILICONFLOW',
      configured: true,
      providers: {
        SILICONFLOW: {
          capabilities: providerCapabilities.SILICONFLOW,
          createdAt: '2026-08-29T00:00:00.000Z',
          keyHint: '••••••••',
          lastUsedAt: '2026-08-29T00:00:00.000Z',
          models: providerModelPresets.SILICONFLOW,
          provider: 'SILICONFLOW',
          state: 'AVAILABLE',
        },
        STEPFUN: null,
      },
    } as const;

    expect(providerConfigSummarySchema.parse(summary)).toEqual(summary);

    const summaryWithoutCapabilities = structuredClone(summary) as {
      providers: { SILICONFLOW: { capabilities?: unknown } };
    };
    delete summaryWithoutCapabilities.providers.SILICONFLOW.capabilities;
    expect(providerConfigSummarySchema.safeParse(summaryWithoutCapabilities).success).toBe(false);
  });

  it.each(['STEPFUN', 'SILICONFLOW'])('accepts the %s preset without a base URL', (provider) => {
    expect(
      providerConfigInputSchema.parse({
        apiKey: 'project-key',
        provider,
      }),
    ).toEqual({ apiKey: 'project-key', provider });
  });

  it.each([
    { apiKey: 'project-key', baseURL: 'https://attacker.invalid', provider: 'STEPFUN' },
    { apiKey: 'project-key', provider: 'UNKNOWN' },
    { apiKey: 'line-one\nline-two', provider: 'STEPFUN' },
  ])('rejects non-preset or injection-capable input before external access', (input) => {
    expect(providerConfigInputSchema.safeParse(input).success).toBe(false);
  });
});
