import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ProviderId } from '../provider-config';
import { providerPresets } from '../provider-config/server';
import { ProviderGatewayError, runStructuredProviderCall } from './provider-adapter';

const outputSchema = z.object({ status: z.literal('ok') }).strict();

function config(provider: ProviderId) {
  return {
    apiKey: 'test-only-placeholder-key',
    models: providerPresets[provider].models,
    provider,
  };
}

function streamingResponse(provider: ProviderId): Response {
  const encoder = new TextEncoder();
  const model = providerPresets[provider].models.fast;
  const event = {
    choices: [
      {
        delta: { content: JSON.stringify({ status: 'ok' }), role: 'assistant' },
        finish_reason: null,
        index: 0,
      },
    ],
    created: 1_788_000_000,
    id: 'safe-test-id',
    model,
    object: 'chat.completion.chunk',
  };
  const end = {
    choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
    created: 1_788_000_000,
    id: 'safe-test-id',
    model,
    object: 'chat.completion.chunk',
  };

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(end)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' }, status: 200 },
  );
}

describe.each(['STEPFUN', 'SILICONFLOW'] as const)('%s provider adapter', (provider) => {
  it('uses only the approved endpoint/model and requires JSON Schema output', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        max_tokens?: number;
        model?: string;
        response_format?: { type?: string };
      };
      expect(String(input)).toBe(`${providerPresets[provider].baseURL}/chat/completions`);
      expect(body.model).toBe(providerPresets[provider].models.fast);
      expect(body.max_tokens).toBe(2_048);
      expect(body.response_format?.type).toBe('json_schema');
      return streamingResponse(provider);
    });

    await expect(
      runStructuredProviderCall({
        config: config(provider),
        fetch,
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
      }),
    ).resolves.toEqual({ status: 'ok' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    [401, 'PROVIDER_AUTH_FAILED'],
    [403, 'PROVIDER_AUTH_FAILED'],
    [400, 'OUTPUT_INVALID'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ] as const)('normalizes HTTP %s without raw provider detail', async (status, code) => {
    const rawDetail = 'raw-provider-response-with-sensitive-detail';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const promise = runStructuredProviderCall({
        config: config(provider),
        fetch: () =>
          Promise.resolve(new Response(JSON.stringify({ detail: rawDetail }), { status })),
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
      });

      await expect(promise).rejects.toEqual(new ProviderGatewayError(code));
      await expect(promise).rejects.not.toHaveProperty('cause');
      await expect(promise).rejects.not.toHaveProperty(
        'message',
        expect.stringContaining(rawDetail),
      );
      expect(consoleError).not.toHaveBeenCalled();
      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      stderrWrite.mockRestore();
    }
  });

  it('classifies HTTP 404 as a missing model only for the verified StepFun endpoint', async () => {
    await expect(
      runStructuredProviderCall({
        config: config(provider),
        fetch: () => Promise.resolve(new Response(null, { status: 404 })),
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
      }),
    ).rejects.toEqual(
      new ProviderGatewayError(
        provider === 'STEPFUN' ? 'PROVIDER_MODEL_NOT_FOUND' : 'OUTPUT_INVALID',
      ),
    );
  });

  it('recognizes only the verified SiliconFlow missing-model code on HTTP 400', async () => {
    if (provider !== 'SILICONFLOW') {
      return;
    }

    await expect(
      runStructuredProviderCall({
        config: config(provider),
        fetch: () =>
          Promise.resolve(
            new Response(JSON.stringify({ code: 20012, message: 'safe fixture' }), {
              status: 400,
            }),
          ),
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
      }),
    ).rejects.toEqual(new ProviderGatewayError('PROVIDER_MODEL_NOT_FOUND'));
  });

  it('normalizes network failures as provider unavailable', async () => {
    await expect(
      runStructuredProviderCall({
        config: config(provider),
        fetch: () => Promise.reject(new TypeError('synthetic network failure')),
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
      }),
    ).rejects.toEqual(new ProviderGatewayError('PROVIDER_UNAVAILABLE'));
  });

  it('distinguishes caller cancellation from the bounded timeout', async () => {
    const stalledFetch = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const callerController = new AbortController();
    const cancelled = runStructuredProviderCall({
      abortSignal: callerController.signal,
      config: config(provider),
      fetch: stalledFetch,
      prompt: 'Return status=ok.',
      role: 'fast',
      schema: outputSchema,
      schemaName: 'SafeTestOutput',
    });
    callerController.abort();

    await expect(cancelled).rejects.toEqual(new ProviderGatewayError('REQUEST_CANCELLED'));
    await expect(
      runStructuredProviderCall({
        config: config(provider),
        fetch: stalledFetch,
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
        timeoutMs: 5,
      }),
    ).rejects.toEqual(new ProviderGatewayError('PROVIDER_UNAVAILABLE'));
  });
});
