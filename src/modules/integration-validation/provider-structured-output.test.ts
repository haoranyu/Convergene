import { describe, expect, it, vi } from 'vitest';

import {
  ProviderProbeError,
  providerValidationDefinitions,
  runProviderStructuredOutputProbe,
  type ValidationProvider,
} from './provider-structured-output';

function createStreamingResponse(provider: ValidationProvider, modelId: string): Response {
  const encoder = new TextEncoder();
  const output = JSON.stringify({ provider, status: 'ok', value: 7 });
  const deltas = [output.slice(0, 20), output.slice(20)];
  const events: Array<Record<string, unknown>> = deltas.map((content, index) => ({
    choices: [
      {
        delta: { content, ...(index === 0 ? { role: 'assistant' } : {}) },
        finish_reason: null,
        index: 0,
      },
    ],
    created: 1_788_000_000,
    id: `probe-${provider.toLowerCase()}`,
    model: modelId,
    object: 'chat.completion.chunk',
  }));
  events.push({
    choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
    created: 1_788_000_000,
    id: `probe-${provider.toLowerCase()}`,
    model: modelId,
    object: 'chat.completion.chunk',
  });

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' }, status: 200 },
  );
}

function createOpenAICompatibleStreamingFetch(
  provider: ValidationProvider,
  modelId: string,
  expectedReasoningEffort: 'low' | null = provider === 'STEPFUN' ? 'low' : null,
) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestBody = JSON.parse(String(init?.body)) as {
      enable_thinking?: boolean;
      max_tokens?: number;
      messages?: Array<{ content?: string; role?: string }>;
      reasoning_effort?: string;
      response_format?: {
        json_schema?: { schema?: unknown; strict?: boolean };
        type?: string;
      };
      stream?: boolean;
    };

    expect(String(input)).toBe(
      `${providerValidationDefinitions[provider].baseURL}/chat/completions`,
    );
    expect(requestBody.enable_thinking).toBe(provider === 'SILICONFLOW' ? false : undefined);
    expect(requestBody.reasoning_effort).toBe(expectedReasoningEffort ?? undefined);
    expect(requestBody.max_tokens).toBe(512);
    expect(requestBody.response_format?.type).toBe(
      provider === 'STEPFUN' ? 'json_object' : 'json_schema',
    );
    if (provider === 'STEPFUN') {
      expect(requestBody.messages?.[0]).toMatchObject({ role: 'system' });
      expect(requestBody.messages?.[0]?.content).toContain('"additionalProperties":false');
    } else {
      expect(requestBody.response_format?.json_schema?.strict).toBe(true);
      expect(JSON.stringify(requestBody.response_format?.json_schema?.schema)).toContain(
        '"additionalProperties":false',
      );
    }
    expect(requestBody.stream).toBe(true);

    return createStreamingResponse(provider, modelId);
  };
}

describe.each(['STEPFUN', 'SILICONFLOW'] as const)(
  '%s OpenAI-compatible adapter validation',
  (provider) => {
    it('streams the provider output mode and returns only safe latency metadata', async () => {
      const modelId = provider === 'STEPFUN' ? 'step-3.7-flash' : 'test-model';
      const timestamps = [100, 112, 145];
      const result = await runProviderStructuredOutputProbe({
        apiKey: 'test-only-placeholder-key',
        fetch: createOpenAICompatibleStreamingFetch(provider, modelId),
        modelId,
        now: () => timestamps.shift()!,
        provider,
      });

      expect(result).toEqual({
        firstChunkLatencyMs: 12,
        modelId,
        provider,
        outputValidated: true,
        streamChunkCount: 2,
        totalLatencyMs: 45,
      });
      expect(result).not.toHaveProperty('apiKey');
    });

    it('normalizes non-2xx responses without provider response or credential detail', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        const probe = runProviderStructuredOutputProbe({
          apiKey: 'test-only-placeholder-key',
          fetch: () =>
            Promise.resolve(
              new Response(JSON.stringify({ detail: 'raw credential and response detail' }), {
                status: 401,
              }),
            ),
          modelId: 'test-model',
          now: () => 100,
          provider,
        });

        await expect(probe).rejects.toEqual(
          expect.objectContaining({
            code: 'PROVIDER_PROBE_FAILED',
            elapsedMs: 0,
            failureKind: 'PROVIDER_ERROR',
            message: `Structured-output probe failed for ${provider}`,
          }),
        );
        await expect(probe).rejects.not.toHaveProperty('cause');
        expect(consoleError).not.toHaveBeenCalled();
        expect(stderrWrite).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
        stderrWrite.mockRestore();
      }
    });

    it('aborts a stalled provider call at the configured timeout', async () => {
      const probe = runProviderStructuredOutputProbe({
        apiKey: 'test-only-placeholder-key',
        fetch: (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
              once: true,
            });
          }),
        modelId: 'test-model',
        provider,
        timeoutMs: 5,
      });

      await expect(probe).rejects.toBeInstanceOf(ProviderProbeError);
      await expect(probe).rejects.toMatchObject({
        code: 'PROVIDER_PROBE_FAILED',
        failureKind: 'TIMEOUT',
        message: `Structured-output probe failed for ${provider}`,
      });
    });
  },
);

describe('StepFun probe request policy', () => {
  it.each([
    ['step-3.5-flash-2603', 'low'],
    ['step-3.5-flash', null],
  ] as const)(
    'sends only the reasoning effort supported by %s',
    async (modelId, reasoningEffort) => {
      const timestamps = [100, 112, 145];
      const result = await runProviderStructuredOutputProbe({
        apiKey: 'test-only-placeholder-key',
        fetch: createOpenAICompatibleStreamingFetch('STEPFUN', modelId, reasoningEffort),
        modelId,
        now: () => timestamps.shift()!,
        provider: 'STEPFUN',
      });

      expect(result).toMatchObject({ modelId, outputValidated: true, provider: 'STEPFUN' });
    },
  );
});
