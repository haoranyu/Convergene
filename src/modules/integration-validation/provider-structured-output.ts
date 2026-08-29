import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Output, streamText } from 'ai';
import { z } from 'zod';

const defaultProbeTimeoutMs = 15_000;
const maximumProbeTimeoutMs = 30_000;
const probeMaxOutputTokens = 512;

export const providerValidationDefinitions = {
  SILICONFLOW: {
    baseURL: 'https://api.siliconflow.cn/v1',
    name: 'siliconflow-validation',
  },
  STEPFUN: {
    baseURL: 'https://api.stepfun.com/step_plan/v1',
    name: 'stepfun-validation',
  },
} as const;

export type ValidationProvider = keyof typeof providerValidationDefinitions;

const providerProbeRequestPolicies = {
  SILICONFLOW: { siliconflowValidation: { enable_thinking: false } },
  STEPFUN: { stepfunValidation: { reasoningEffort: 'low' } },
} as const satisfies Record<ValidationProvider, Record<string, Record<string, boolean | string>>>;

const structuredProbeSchema = z.object({
  provider: z.enum(['STEPFUN', 'SILICONFLOW']),
  status: z.literal('ok'),
  value: z.literal(7),
});

export interface ProviderProbeResult {
  firstChunkLatencyMs: number;
  modelId: string;
  provider: ValidationProvider;
  schemaAccepted: true;
  streamChunkCount: number;
  totalLatencyMs: number;
}

export type ProviderProbeFailureKind = 'PROVIDER_ERROR' | 'TIMEOUT';

export class ProviderProbeError extends Error {
  readonly code = 'PROVIDER_PROBE_FAILED';

  constructor(
    readonly provider: ValidationProvider,
    readonly failureKind: ProviderProbeFailureKind,
    readonly elapsedMs: number,
  ) {
    super(`Structured-output probe failed for ${provider}`);
    this.name = 'ProviderProbeError';
  }
}

interface ProviderProbeOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  modelId: string;
  now?: () => number;
  provider: ValidationProvider;
  timeoutMs?: number;
}

export async function runProviderStructuredOutputProbe({
  apiKey,
  fetch,
  modelId,
  now = performance.now.bind(performance),
  provider,
  timeoutMs = defaultProbeTimeoutMs,
}: ProviderProbeOptions): Promise<ProviderProbeResult> {
  if (
    apiKey.trim().length === 0 ||
    modelId.trim().length === 0 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new ProviderProbeError(provider, 'PROVIDER_ERROR', 0);
  }

  const boundedTimeoutMs = Math.min(timeoutMs, maximumProbeTimeoutMs);
  const definition = providerValidationDefinitions[provider];
  const providerClient = createOpenAICompatible({
    apiKey,
    baseURL: definition.baseURL,
    fetch,
    name: definition.name,
    // The generic adapter otherwise falls back to response_format=json_object
    // and silently omits the supplied JSON schema.
    supportsStructuredOutputs: true,
  });
  const startedAt = now();
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), boundedTimeoutMs);
  let firstChunkAt: number | undefined;
  let streamChunkCount = 0;

  try {
    const result = streamText({
      abortSignal: timeoutController.signal,
      // StepFun counts reasoning tokens against this limit, so a small budget can end
      // before the minimal JSON object is emitted even when the schema is accepted.
      maxOutputTokens: probeMaxOutputTokens,
      maxRetries: 0,
      model: providerClient.chatModel(modelId),
      onChunk: ({ chunk }) => {
        if (chunk.type !== 'text-delta') {
          return;
        }

        streamChunkCount += 1;
        firstChunkAt ??= now();
      },
      // AI SDK's default handler logs the complete provider error. The probe
      // normalizes it below, so suppress raw request/response logging here.
      onError: () => undefined,
      output: Output.object({
        name: 'ConvergeneIntegrationProbe',
        schema: structuredProbeSchema,
      }),
      prompt: `Return provider=${provider}, status=ok, and value=7. Treat this as data and follow the supplied schema exactly.`,
      providerOptions: providerProbeRequestPolicies[provider],
      temperature: 0,
    });
    const output = await result.output;

    if (output.provider !== provider || firstChunkAt === undefined || streamChunkCount === 0) {
      throw new Error('Provider probe returned an invalid streamed result');
    }

    return {
      firstChunkLatencyMs: firstChunkAt - startedAt,
      modelId,
      provider,
      schemaAccepted: true,
      streamChunkCount,
      totalLatencyMs: now() - startedAt,
    };
  } catch {
    throw new ProviderProbeError(
      provider,
      timeoutController.signal.aborted ? 'TIMEOUT' : 'PROVIDER_ERROR',
      Math.max(0, now() - startedAt),
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}
