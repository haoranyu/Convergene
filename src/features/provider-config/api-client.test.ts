import { describe, expect, it, vi } from 'vitest';

import { createProviderConfigClient } from './api-client';

describe('providerConfigClient', () => {
  it('replaces malformed server errors with a stable safe code', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'UNEXPECTED', message: 'raw provider response should stay hidden' },
          ok: false,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 502 },
      ),
    );

    const result = await createProviderConfigClient(fetchImplementation).getStatus();

    expect(result).toEqual({ error: { code: 'PROVIDER_UNAVAILABLE' }, ok: false });
  });
});
