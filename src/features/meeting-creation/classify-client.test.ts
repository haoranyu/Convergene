import { describe, expect, it, vi } from 'vitest';

import { createClassifyMeetingClient } from './classify-client';

describe('classifyMeetingClient', () => {
  it('accepts the typed response and sends only the classify input', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ok: true,
        value: {
          confidence: 'HIGH',
          reason: 'A concrete choice is required.',
          recommendedMode: 'DECISION',
          suggestedTitle: 'Choose the launch plan',
        },
      }),
    );
    const client = createClassifyMeetingClient(fetchImplementation);

    await expect(client.classify({ rawRequest: 'Choose a launch plan' })).resolves.toMatchObject({
      ok: true,
      value: { recommendedMode: 'DECISION' },
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/ai/classify-meeting',
      expect.objectContaining({
        body: JSON.stringify({ rawRequest: 'Choose a launch plan' }),
        method: 'POST',
      }),
    );
  });

  it('replaces malformed payloads with a safe stable failure', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ ok: true, value: { apiKey: 'must-not-reach-the-client' } }),
      );

    await expect(
      createClassifyMeetingClient(fetchImplementation).classify({ rawRequest: 'Review launch' }),
    ).resolves.toEqual({ error: { code: 'PROVIDER_UNAVAILABLE' }, ok: false });
  });
});
