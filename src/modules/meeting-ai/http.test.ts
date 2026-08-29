import { describe, expect, it } from 'vitest';

import { MeetingAIContractError } from './classify-meeting';
import { meetingAIErrorResponse } from './http';

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
});
