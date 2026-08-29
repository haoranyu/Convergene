import 'server-only';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { APICallError, Output, streamText } from 'ai';
import type { z } from 'zod';

import type { ProviderId } from '../provider-config';
import type { ProviderModelMapping } from '../provider-config';
import { providerPresets } from '../provider-config/server';

const defaultTimeoutMs = 15_000;
const maximumTimeoutMs = 60_000;
const defaultMaxOutputTokens = 2_048;
const minimumMaxOutputTokens = 512;

const providerRequestPolicies = {
  SILICONFLOW: { enable_thinking: false },
  STEPFUN: { reasoningEffort: 'low' },
} as const satisfies Record<ProviderId, Record<string, boolean | string>>;

export type ProviderTaskRole = keyof ProviderModelMapping;

export type ProviderGatewayErrorCode =
  | 'OUTPUT_INVALID'
  | 'PROVIDER_ACCESS_RESTRICTED'
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
  credentialRevision?: string;
  models: ProviderModelMapping;
  provider: ProviderId;
}

export interface StructuredProviderCallOptions<Schema extends z.ZodType> {
  abortSignal?: AbortSignal;
  config: ResolvedProviderConfig;
  fetch?: typeof globalThis.fetch;
  maxOutputTokens?: number;
  onConfirmedAuthFailure?: (provider: ProviderId) => Promise<void>;
  prompt: string;
  role: ProviderTaskRole;
  schema: Schema;
  schemaName: string;
  timeoutMs?: number;
}

interface SafeApiErrorMetadata {
  data?: unknown;
  responseBody?: string;
  statusCode?: number;
}

function findApiErrorMetadata(error: unknown): SafeApiErrorMetadata | undefined {
  let current = error;
  const seen = new Set<unknown>();

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);

    if (APICallError.isInstance(current)) {
      return {
        data: current.data,
        responseBody: current.responseBody,
        statusCode: current.statusCode,
      };
    }

    const candidate = current as {
      cause?: unknown;
      data?: unknown;
      responseBody?: unknown;
      statusCode?: unknown;
    };
    if (typeof candidate.statusCode === 'number') {
      return {
        data: candidate.data,
        responseBody:
          typeof candidate.responseBody === 'string' ? candidate.responseBody : undefined,
        statusCode: candidate.statusCode,
      };
    }

    current = candidate.cause;
  }

  return undefined;
}

function safeProviderResponseCode(responseBody: string | undefined): string | number | undefined {
  if (!responseBody || responseBody.length > 4_096) {
    return undefined;
  }

  try {
    return safeProviderErrorCode(JSON.parse(responseBody));
  } catch {
    return undefined;
  }
}

function hasTypeError(error: unknown): boolean {
  let current = error;
  const seen = new Set<unknown>();

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    if (current instanceof TypeError) {
      return true;
    }
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

function safeProviderErrorCode(data: unknown): string | number | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  if ('code' in data && (typeof data.code === 'string' || typeof data.code === 'number')) {
    return data.code;
  }

  return 'error' in data ? safeProviderErrorCode(data.error) : undefined;
}

function isKnownMissingModel(
  provider: ProviderId,
  metadata: SafeApiErrorMetadata | undefined,
): boolean {
  if (provider === 'STEPFUN' && metadata?.statusCode === 404) {
    return true;
  }

  return (
    provider === 'SILICONFLOW' &&
    metadata?.statusCode === 400 &&
    String(
      safeProviderErrorCode(metadata.data) ?? safeProviderResponseCode(metadata.responseBody),
    ) === '20012'
  );
}

function normalizeProviderError(
  error: unknown,
  provider: ProviderId,
  callerAborted: boolean,
  timeoutAborted: boolean,
): ProviderGatewayError {
  if (callerAborted) {
    return new ProviderGatewayError('REQUEST_CANCELLED');
  }

  if (timeoutAborted) {
    return new ProviderGatewayError('PROVIDER_UNAVAILABLE');
  }

  const metadata = findApiErrorMetadata(error);
  const statusCode = metadata?.statusCode;
  if (statusCode === 401) {
    return new ProviderGatewayError('PROVIDER_AUTH_FAILED');
  }
  if (statusCode === 403) {
    return new ProviderGatewayError('PROVIDER_ACCESS_RESTRICTED');
  }
  if (isKnownMissingModel(provider, metadata)) {
    return new ProviderGatewayError('PROVIDER_MODEL_NOT_FOUND');
  }
  if (statusCode === 429) {
    return new ProviderGatewayError('PROVIDER_RATE_LIMITED');
  }
  if (statusCode !== undefined && statusCode >= 500) {
    return new ProviderGatewayError('PROVIDER_UNAVAILABLE');
  }
  if (metadata && statusCode === undefined) {
    return new ProviderGatewayError('PROVIDER_UNAVAILABLE');
  }
  if (hasTypeError(error)) {
    return new ProviderGatewayError('PROVIDER_UNAVAILABLE');
  }

  return new ProviderGatewayError('OUTPUT_INVALID');
}

export async function runStructuredProviderCall<Schema extends z.ZodType>({
  abortSignal,
  config,
  fetch,
  maxOutputTokens = defaultMaxOutputTokens,
  onConfirmedAuthFailure,
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
      providerOptions: { [preset.name]: providerRequestPolicies[config.provider] },
      temperature: 0,
    });

    return schema.parse(await result.output);
  } catch (error) {
    const normalizedError = normalizeProviderError(
      streamedError ?? error,
      config.provider,
      abortSignal?.aborted === true,
      timeoutController.signal.aborted,
    );
    if (normalizedError.code === 'PROVIDER_AUTH_FAILED') {
      await onConfirmedAuthFailure?.(config.provider);
    }
    throw normalizedError;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
