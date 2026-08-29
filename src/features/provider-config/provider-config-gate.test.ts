import { describe, expect, it } from 'vitest';

import { providerConfigGateReason } from './provider-config-gate';

describe('ProviderConfigGate', () => {
  it('recognizes the stable AI error without treating unrelated failures as configuration gates', () => {
    expect(
      providerConfigGateReason({ error: { code: 'PROVIDER_NOT_CONFIGURED' }, ok: false }),
    ).toBe('PROVIDER_NOT_CONFIGURED');
    expect(
      providerConfigGateReason({ error: { code: 'PROVIDER_CONFIG_INVALID' }, ok: false }),
    ).toBe('PROVIDER_CONFIG_INVALID');
    expect(providerConfigGateReason({ error: { code: 'PROVIDER_AUTH_FAILED' }, ok: false })).toBe(
      'PROVIDER_AUTH_FAILED',
    );
    expect(
      providerConfigGateReason({ error: { code: 'PROVIDER_UNAVAILABLE' }, ok: false }),
    ).toBeNull();
    expect(providerConfigGateReason(new Error('provider not configured'))).toBeNull();
  });
});
