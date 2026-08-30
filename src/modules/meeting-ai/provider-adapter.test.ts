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

function streamingResponse(
  provider: ProviderId,
  {
    content = JSON.stringify({ status: 'ok' }),
    finishReason = 'stop',
  }: { content?: string; finishReason?: string } = {},
): Response {
  const encoder = new TextEncoder();
  const model = providerPresets[provider].models.fast;
  const event = {
    choices: [
      {
        delta: { content, role: 'assistant' },
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
    choices: [{ delta: {}, finish_reason: finishReason, index: 0 }],
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

function emptyStreamingResponse(): Response {
  return new Response('data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
    status: 200,
  });
}

describe.each(['STEPFUN', 'SILICONFLOW'] as const)('%s provider adapter', (provider) => {
  it('uses only the approved endpoint, model, request policy, and JSON Schema output', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        enable_thinking?: boolean;
        max_tokens?: number;
        model?: string;
        reasoning_effort?: string;
        response_format?: { type?: string };
      };
      expect(String(input)).toBe(`${providerPresets[provider].baseURL}/chat/completions`);
      expect(body.model).toBe(providerPresets[provider].models.fast);
      expect(body.enable_thinking).toBe(provider === 'SILICONFLOW' ? false : undefined);
      expect(body.reasoning_effort).toBe(provider === 'STEPFUN' ? 'low' : undefined);
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
    [401, 'PROVIDER_AUTH_FAILED', undefined],
    [403, 'PROVIDER_ACCESS_RESTRICTED', undefined],
    [400, 'OUTPUT_INVALID', 'UPSTREAM_REJECTED'],
    [429, 'PROVIDER_RATE_LIMITED', undefined],
    [503, 'PROVIDER_UNAVAILABLE', undefined],
  ] as const)(
    'normalizes HTTP %s without raw provider detail',
    async (status, code, outputFailure) => {
      const rawDetail = 'raw-provider-response-with-sensitive-detail';
      const onConfirmedAuthFailure = vi.fn().mockResolvedValue(undefined);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        const promise = runStructuredProviderCall({
          config: config(provider),
          fetch: () =>
            Promise.resolve(new Response(JSON.stringify({ detail: rawDetail }), { status })),
          onConfirmedAuthFailure,
          prompt: 'Return status=ok.',
          role: 'fast',
          schema: outputSchema,
          schemaName: 'SafeTestOutput',
        });

        await expect(promise).rejects.toEqual(new ProviderGatewayError(code, outputFailure));
        await expect(promise).rejects.not.toHaveProperty('cause');
        await expect(promise).rejects.not.toHaveProperty(
          'message',
          expect.stringContaining(rawDetail),
        );
        expect(consoleError).not.toHaveBeenCalled();
        expect(stderrWrite).not.toHaveBeenCalled();
        expect(onConfirmedAuthFailure).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
        if (status === 401) {
          expect(onConfirmedAuthFailure).toHaveBeenCalledWith(provider);
        }
      } finally {
        consoleError.mockRestore();
        stderrWrite.mockRestore();
      }
    },
  );

  it.each([
    ['truncated output', '{"status":', 'length', 'TRUNCATED'],
    ['content-filtered output', '{"status":"blocked"}', 'content_filter', 'CONTENT_FILTERED'],
    ['invalid JSON', 'not-json', 'stop', 'JSON_PARSE'],
    ['schema mismatch', '{"status":"not-ok"}', 'stop', 'SCHEMA_MISMATCH'],
  ] as const)(
    'classifies %s without retaining generated text',
    async (_name, content, finishReason, outputFailure) => {
      const generatedText = content;
      const promise = runStructuredProviderCall({
        config: config(provider),
        fetch: () =>
          Promise.resolve(streamingResponse(provider, { content: generatedText, finishReason })),
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
      });

      await expect(promise).rejects.toEqual(
        new ProviderGatewayError('OUTPUT_INVALID', outputFailure),
      );
      await expect(promise).rejects.not.toHaveProperty('cause');
      await expect(promise).rejects.not.toHaveProperty(
        'message',
        expect.stringContaining(generatedText),
      );
    },
  );

  it('classifies an empty completed stream without inspecting generated text', async () => {
    await expect(
      runStructuredProviderCall({
        config: config(provider),
        fetch: () => Promise.resolve(emptyStreamingResponse()),
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
      }),
    ).rejects.toEqual(new ProviderGatewayError('OUTPUT_INVALID', 'JSON_PARSE'));
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
        provider === 'STEPFUN' ? undefined : 'UPSTREAM_REJECTED',
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
