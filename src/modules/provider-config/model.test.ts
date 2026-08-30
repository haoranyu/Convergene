import { describe, expect, it } from 'vitest';

import { providerConfigInputSchema, providerModelPresets } from './model';

describe('provider configuration input', () => {
  it('uses the Step Plan low-latency preset for fast structured output', () => {
    expect(providerModelPresets.STEPFUN).toEqual({
      fast: 'step-3.5-flash-2603',
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
