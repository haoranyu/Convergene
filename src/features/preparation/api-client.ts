import { z } from 'zod';

import type { SupportedLocale } from '@/modules/meeting-domain';

import {
  grillInputSchema,
  initialMapInputSchema,
  initialMapOutputSchema,
  parseGrillOutput,
  preparationAIErrorCodes,
  type AIRequest,
  type GrillOutput,
  type InitialMapOutput,
  type PreparationAIClient,
  type PreparationAIErrorCode,
} from './ai-contract';

const errorResponseSchema = z
  .object({
    error: z.object({ code: z.enum(preparationAIErrorCodes) }).strict(),
    ok: z.literal(false),
    requestId: z.string().optional(),
    task: z.enum(['grill', 'initial-map']).optional(),
  })
  .strict();

const successEnvelopeSchema = z
  .object({
    ok: z.literal(true).optional(),
    output: z.unknown(),
    requestId: z.string(),
    task: z.enum(['grill', 'initial-map']),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export class PreparationAIClientError extends Error {
  constructor(readonly code: PreparationAIErrorCode) {
    super(code);
    this.name = 'PreparationAIClientError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PreparationAIClientError('UNKNOWN');
  }
}

async function postTask<TInput, TOutput>(
  task: 'grill' | 'initial-map',
  input: TInput,
  outputLocale: SupportedLocale,
  parseOutput: (value: unknown) => TOutput,
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
): Promise<TOutput> {
  const requestId = crypto.randomUUID();
  const request: AIRequest<TInput> = { input, outputLocale, requestId, task };
  let response: Response;
  try {
    response = await fetchImplementation(`/api/ai/${task}`, {
      body: JSON.stringify(request),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal,
    });
  } catch {
    if (signal?.aborted) throw new PreparationAIClientError('REQUEST_CANCELLED');
    throw new PreparationAIClientError('PROVIDER_UNAVAILABLE');
  }

  const body = await readJson(response);
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    throw new PreparationAIClientError(parsed.success ? parsed.data.error.code : 'UNKNOWN');
  }

  const envelope = successEnvelopeSchema.safeParse(body);
  if (!envelope.success || envelope.data.requestId !== requestId || envelope.data.task !== task) {
    throw new PreparationAIClientError('OUTPUT_INVALID');
  }
  try {
    return parseOutput(envelope.data.output);
  } catch {
    throw new PreparationAIClientError('OUTPUT_INVALID');
  }
}

export function createPreparationAIClient(
  fetchImplementation: typeof fetch = fetch,
): PreparationAIClient {
  return {
    grill(input, outputLocale, signal) {
      const parsedInput = grillInputSchema.safeParse(input);
      if (!parsedInput.success) throw new PreparationAIClientError('INPUT_INVALID');
      return postTask(
        'grill',
        parsedInput.data,
        outputLocale,
        (output): GrillOutput => parseGrillOutput(parsedInput.data, output),
        signal,
        fetchImplementation,
      );
    },
    initialMap(input, outputLocale, signal) {
      const parsedInput = initialMapInputSchema.safeParse(input);
      if (!parsedInput.success) throw new PreparationAIClientError('INPUT_INVALID');
      return postTask(
        'initial-map',
        parsedInput.data,
        outputLocale,
        (output): InitialMapOutput => initialMapOutputSchema.parse(output),
        signal,
        fetchImplementation,
      );
    },
  };
}

export const preparationAIClient = createPreparationAIClient();
