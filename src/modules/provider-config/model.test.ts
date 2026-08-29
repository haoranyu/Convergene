import { describe, expect, it } from 'vitest';

import { providerConfigInputSchema } from './model';

describe('provider configuration input', () => {
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
