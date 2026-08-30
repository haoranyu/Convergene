import { describe, expect, it } from 'vitest';

import { providerConfigInputSchema, providerModelPresets } from './model';

describe('provider configuration input', () => {
  it('keeps every StepFun structured-output role on the schema-capable preset', () => {
    expect(providerModelPresets.STEPFUN).toEqual({
      fast: 'step-3.7-flash',
      grill: 'step-3.5-flash-2603',
      report: 'step-3.5-flash-2603',
    });
  });

  it('keeps SiliconFlow fast work on the non-reasoning low-activation preset', () => {
    expect(providerModelPresets.SILICONFLOW).toEqual({
      fast: 'inclusionAI/Ling-mini-2.0',
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
