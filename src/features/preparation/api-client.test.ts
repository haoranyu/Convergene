import { describe, expect, it, vi } from 'vitest';

import { grillOutputFixtures } from '@/fixtures/preparation';

import { createEmptyKnownState, type GrillInput } from './ai-contract';
import { createPreparationAIClient, PreparationAIClientError } from './api-client';

const input: GrillInput = {
  history: [],
  knownState: createEmptyKnownState(),
  mode: 'DECISION',
  phase: 'DEFAULT',
  rawRequest: 'Choose a launch plan',
  turnIndex: 0,
};

describe('PreparationAIClient', () => {
  it('uses the real Grill endpoint and requires the request and task echo', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (url, init) => {
      const request = JSON.parse(String(init?.body)) as { requestId: string };
      expect(url).toBe('/api/ai/grill');
      expect(init).toMatchObject({
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      return Response.json({
        output: grillOutputFixtures.DECISION,
        requestId: request.requestId,
        task: 'grill',
      });
    });
    const client = createPreparationAIClient(fetchImplementation);
    await expect(client.grill(input, 'en-US')).resolves.toEqual(grillOutputFixtures.DECISION);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('maps safe server codes and rejects a mismatched success envelope', async () => {
    const unavailable = createPreparationAIClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: { code: 'PROVIDER_NOT_CONFIGURED' },
            ok: false,
            task: 'grill',
          },
          { status: 409 },
        ),
      ),
    );
    await expect(unavailable.grill(input, 'en-US')).rejects.toEqual(
      new PreparationAIClientError('PROVIDER_NOT_CONFIGURED'),
    );

    const wrongEcho = createPreparationAIClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          output: grillOutputFixtures.DECISION,
          requestId: 'another-request',
          task: 'grill',
        }),
      ),
    );
    await expect(wrongEcho.grill(input, 'en-US')).rejects.toEqual(
      new PreparationAIClientError('OUTPUT_INVALID'),
    );
  });
});
