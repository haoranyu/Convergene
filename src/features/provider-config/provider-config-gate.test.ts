import { describe, expect, it } from 'vitest';

import { isProviderNotConfigured } from './provider-config-gate';

describe('ProviderConfigGate', () => {
  it('recognizes the stable AI error without treating unrelated failures as configuration gates', () => {
    expect(isProviderNotConfigured({ error: { code: 'PROVIDER_NOT_CONFIGURED' }, ok: false })).toBe(
      true,
    );
    expect(isProviderNotConfigured({ error: { code: 'PROVIDER_UNAVAILABLE' }, ok: false })).toBe(
      false,
    );
    expect(isProviderNotConfigured(new Error('provider not configured'))).toBe(false);
  });
});
