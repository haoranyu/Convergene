import { describe, expect, it } from 'vitest';

import { ResolvedProviderConfigError } from '@/modules/provider-config/server';

import { MeetingAIContractError } from './classify-meeting';
import { meetingAIErrorResponse } from './http';
import { ProviderGatewayError } from './provider-adapter';

describe('meeting AI HTTP errors', () => {
  it('keeps unexpected failures distinct from provider configuration failures', async () => {
    const response = meetingAIErrorResponse(new Error('synthetic unexpected failure'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNKNOWN' },
      ok: false,
    });
  });

  it('returns the explicit output-language mismatch category', async () => {
    const response = meetingAIErrorResponse(new MeetingAIContractError());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'OUTPUT_LANGUAGE_MISMATCH' },
      ok: false,
    });
  });

  it('maps provider schema failures to the public retryable output category', async () => {
    const response = meetingAIErrorResponse(
      new ProviderGatewayError('OUTPUT_INVALID', 'SCHEMA_MISMATCH'),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'OUTPUT_INVALID', outputFailure: 'SCHEMA_MISMATCH' },
      ok: false,
    });
  });

  it('does not attach output diagnostics to unrelated public errors', async () => {
    const response = meetingAIErrorResponse(
      new ProviderGatewayError('PROVIDER_UNAVAILABLE', 'SCHEMA_MISMATCH'),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'PROVIDER_UNAVAILABLE' },
      ok: false,
    });
  });

  it('maps an unavailable provider capability to a safe non-retryable response', async () => {
    const error = Object.assign(
      new ResolvedProviderConfigError('PROVIDER_CAPABILITY_UNAVAILABLE'),
      { detail: 'must not cross the public boundary' },
    );
    const response = meetingAIErrorResponse(error);

    expect(response.status).toBe(422);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'PROVIDER_CAPABILITY_UNAVAILABLE' },
      ok: false,
    });
  });
});
