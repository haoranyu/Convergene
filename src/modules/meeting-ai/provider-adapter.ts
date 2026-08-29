import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { APICallError, Output, streamText } from 'ai';
import type { z } from 'zod';

import type { ProviderId } from '../provider-config';
import { providerPresets } from '../provider-config';
import type { ProviderModelMapping } from '../provider-config/model';

const defaultTimeoutMs = 30_000;
const maximumTimeoutMs = 60_000;
const minimumMaxOutputTokens = 512;

export type ProviderTaskRole = keyof ProviderModelMapping;

export type ProviderGatewayErrorCode =
  | 'OUTPUT_INVALID'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'REQUEST_CANCELLED';

export class ProviderGatewayError extends Error {
  constructor(readonly code: ProviderGatewayErrorCode) {
    super(code);
    this.name = 'ProviderGatewayError';
  }
}

export interface ResolvedProviderConfig {
  apiKey: string;
  models: ProviderModelMapping;
  provider: ProviderId;
}

interface StructuredProviderCallOptions<Schema extends z.ZodType> {
  abortSignal?: AbortSignal;
  config: ResolvedProviderConfig;
  fetch?: typeof globalThis.fetch;
  maxOutputTokens?: number;
  prompt: string;
  role: ProviderTaskRole;
  schema: Schema;
  schemaName: string;
  timeoutMs?: number;
}

function findStatusCode(error: unknown): number | undefined {
  let current = error;
  const seen = new Set<unknown>();

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);

    if (APICallError.isInstance(current)) {
      return current.statusCode;
    }

    const candidate = current as { cause?: unknown; statusCode?: unknown };
    if (typeof candidate.statusCode === 'number') {
      return candidate.statusCode;
    }

    current = candidate.cause;
  }

  return undefined;
}

function normalizeProviderError(
  error: unknown,
  callerAborted: boolean,
  timeoutAborted: boolean,
): ProviderGatewayError {
  if (callerAborted) {
    return new ProviderGatewayError('REQUEST_CANCELLED');
  }

  if (timeoutAborted) {
    return new ProviderGatewayError('PROVIDER_UNAVAILABLE');
  }

  const statusCode = findStatusCode(error);
  if (statusCode === 401 || statusCode === 403) {
    return new ProviderGatewayError('PROVIDER_AUTH_FAILED');
  }
  if (statusCode === 400 || statusCode === 404) {
    return new ProviderGatewayError('PROVIDER_MODEL_NOT_FOUND');
  }
  if (statusCode === 429) {
    return new ProviderGatewayError('PROVIDER_RATE_LIMITED');
  }
  if (statusCode !== undefined && statusCode >= 500) {
    return new ProviderGatewayError('PROVIDER_UNAVAILABLE');
  }

  return new ProviderGatewayError('OUTPUT_INVALID');
}

export async function runStructuredProviderCall<Schema extends z.ZodType>({
  abortSignal,
  config,
  fetch,
  maxOutputTokens = minimumMaxOutputTokens,
  prompt,
  role,
  schema,
  schemaName,
  timeoutMs = defaultTimeoutMs,
}: StructuredProviderCallOptions<Schema>): Promise<z.infer<Schema>> {
  const preset = providerPresets[config.provider];
  const timeoutController = new AbortController();
  const boundedTimeoutMs = Math.min(Math.max(timeoutMs, 1), maximumTimeoutMs);
  const timeoutHandle = setTimeout(() => timeoutController.abort(), boundedTimeoutMs);
  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutController.signal])
    : timeoutController.signal;
  let streamedError: unknown;

  try {
    const providerClient = createOpenAICompatible({
      apiKey: config.apiKey,
      baseURL: preset.baseURL,
      fetch,
      name: preset.name,
      supportsStructuredOutputs: true,
    });
    const result = streamText({
      abortSignal: combinedSignal,
      maxOutputTokens: Math.max(maxOutputTokens, minimumMaxOutputTokens),
      maxRetries: 0,
      model: providerClient.chatModel(config.models[role]),
      onError: ({ error }) => {
        streamedError = error;
      },
      output: Output.object({ name: schemaName, schema }),
      prompt,
      temperature: 0,
    });

    return schema.parse(await result.output);
  } catch (error) {
    throw normalizeProviderError(
      streamedError ?? error,
      abortSignal?.aborted === true,
      timeoutController.signal.aborted,
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}
