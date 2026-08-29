import { describe, expect, it, vi } from 'vitest';

import { createClassifyMeetingClient } from './classify-client';

const requestId = '00000000-0000-4000-8000-000000000006';

describe('classifyMeetingClient', () => {
  it('accepts the typed response and sends only the classify input', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        output: {
          confidence: 'HIGH',
          reason: 'A concrete choice is required.',
          recommendedMode: 'DECISION',
          suggestedTitle: 'Choose the launch plan',
        },
        requestId,
        task: 'classify-meeting',
      }),
    );
    const client = createClassifyMeetingClient(fetchImplementation, () => requestId);

    await expect(
      client.classify({ rawRequest: 'Choose a launch plan' }, 'zh-TW'),
    ).resolves.toMatchObject({ ok: true, value: { recommendedMode: 'DECISION' } });
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/ai/classify-meeting',
      expect.objectContaining({
        body: JSON.stringify({
          input: { rawRequest: 'Choose a launch plan' },
          outputLocale: 'zh-TW',
          requestId,
          task: 'classify-meeting',
        }),
        method: 'POST',
      }),
    );
  });

  it('replaces malformed payloads with a safe stable failure', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ output: { apiKey: 'must-not-reach-the-client' } }));

    await expect(
      createClassifyMeetingClient(fetchImplementation, () => requestId).classify(
        { rawRequest: 'Review launch' },
        'en-US',
      ),
    ).resolves.toEqual({ error: { code: 'UNKNOWN' }, ok: false });
  });

  it('rejects a valid response that does not match the pending request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        output: {
          confidence: 'HIGH',
          reason: 'A concrete choice is required.',
          recommendedMode: 'DECISION',
          suggestedTitle: 'Choose the launch plan',
        },
        requestId: '00000000-0000-4000-8000-000000000007',
        task: 'classify-meeting',
      }),
    );

    await expect(
      createClassifyMeetingClient(fetchImplementation, () => requestId).classify(
        { rawRequest: 'Choose a launch plan' },
        'en-US',
      ),
    ).resolves.toEqual({ error: { code: 'REQUEST_CANCELLED' }, ok: false });
  });
});
