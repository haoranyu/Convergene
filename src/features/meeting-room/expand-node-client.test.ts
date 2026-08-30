import { describe, expect, it, vi } from 'vitest';

import type { ExpandNodeRequest } from '@/modules/meeting-ai/expand-node';

import { requestNodeExpansion } from './expand-node-client';

const request: ExpandNodeRequest = {
  input: {
    briefSummary: 'Choose a rollout model.',
    children: [],
    mode: 'DECISION',
    selectedNode: { id: 'topic', kind: 'TOPIC', title: 'Rollout model' },
    siblings: [],
    strategyId: 'DECISION_ADD_OPTION',
  },
  outputLocale: 'en-US',
  requestId: '11111111-1111-4111-8111-111111111111',
  task: 'expand-node',
};

describe('expand-node browser client', () => {
  it('validates and returns the matching response envelope', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        output: {
          children: [
            { kind: 'OPTION', title: 'Guided pilot' },
            { kind: 'RISK', title: 'Enablement cost' },
          ],
        },
        requestId: request.requestId,
        task: 'expand-node',
      }),
    );

    const result = await requestNodeExpansion(request, { fetch });
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      '/api/ai/expand-node',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects malformed and mismatched responses without applying them', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        output: {
          children: [{ kind: 'OPTION', title: 'Only one child' }],
        },
        requestId: '22222222-2222-4222-8222-222222222222',
        task: 'expand-node',
      }),
    );

    await expect(requestNodeExpansion(request, { fetch })).resolves.toEqual({
      error: { code: 'OUTPUT_INVALID' },
      ok: false,
    });
  });

  it('maps a cancelled fetch to REQUEST_CANCELLED and forwards the signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(
      requestNodeExpansion(request, { fetch, signal: controller.signal }),
    ).resolves.toEqual({ error: { code: 'REQUEST_CANCELLED' }, ok: false });
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('keeps stable server error codes and hides arbitrary response data', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'PROVIDER_NOT_CONFIGURED', detail: 'secret' }, ok: false },
          { status: 503 },
        ),
      );

    await expect(requestNodeExpansion(request, { fetch })).resolves.toEqual({
      error: { code: 'PROVIDER_NOT_CONFIGURED' },
      ok: false,
    });
  });

  it('keeps only an allowlisted output failure classification', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'OUTPUT_INVALID',
            detail: 'raw provider detail',
            outputFailure: 'TRUNCATED',
          },
          ok: false,
        },
        { status: 422 },
      ),
    );

    await expect(requestNodeExpansion(request, { fetch })).resolves.toEqual({
      error: { code: 'OUTPUT_INVALID', outputFailure: 'TRUNCATED' },
      ok: false,
    });
  });

  it('rejects unknown output failure values instead of forwarding them', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        {
          error: { code: 'OUTPUT_INVALID', outputFailure: 'RAW_PROVIDER_BODY' },
          ok: false,
        },
        { status: 422 },
      ),
    );

    await expect(requestNodeExpansion(request, { fetch })).resolves.toEqual({
      error: { code: 'UNKNOWN' },
      ok: false,
    });
  });

  it('drops output failure metadata from unrelated error codes', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        {
          error: { code: 'PROVIDER_UNAVAILABLE', outputFailure: 'SCHEMA_MISMATCH' },
          ok: false,
        },
        { status: 503 },
      ),
    );

    await expect(requestNodeExpansion(request, { fetch })).resolves.toEqual({
      error: { code: 'PROVIDER_UNAVAILABLE' },
      ok: false,
    });
  });
});
