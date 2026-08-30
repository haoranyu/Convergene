import { describe, expect, it } from 'vitest';

import { meetingAIErrorResponseSchema } from './error-contract';

describe('meeting AI public error contract', () => {
  it('preserves only an allowlisted output failure for OUTPUT_INVALID', () => {
    expect(
      meetingAIErrorResponseSchema.parse({
        error: {
          code: 'OUTPUT_INVALID',
          detail: 'raw provider detail',
          outputFailure: 'SCHEMA_MISMATCH',
        },
        ok: false,
      }),
    ).toEqual({
      error: { code: 'OUTPUT_INVALID', outputFailure: 'SCHEMA_MISMATCH' },
      ok: false,
    });
  });

  it('drops output failure metadata from every unrelated error code', () => {
    expect(
      meetingAIErrorResponseSchema.parse({
        error: { code: 'PROVIDER_UNAVAILABLE', outputFailure: 'SCHEMA_MISMATCH' },
        ok: false,
      }),
    ).toEqual({ error: { code: 'PROVIDER_UNAVAILABLE' }, ok: false });
  });

  it('rejects output failure values outside the public allowlist', () => {
    expect(() =>
      meetingAIErrorResponseSchema.parse({
        error: { code: 'OUTPUT_INVALID', outputFailure: 'RAW_PROVIDER_BODY' },
        ok: false,
      }),
    ).toThrow();
  });
});
