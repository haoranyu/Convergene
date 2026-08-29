import 'server-only';

import { z } from 'zod';

import {
  ProviderGatewayError,
  runStructuredProviderCall,
  type ResolvedProviderConfig,
} from '../meeting-ai';
import type { ProviderConfigErrorCode, ProviderConnectionResult, ProviderId } from './model';
import { providerPresets } from './presets';

const connectionSchema = z.object({
  provider: z.enum(['STEPFUN', 'SILICONFLOW']),
  status: z.literal('ok'),
  value: z.literal(7),
});

export class ProviderConnectionError extends Error {
  constructor(readonly code: ProviderConfigErrorCode) {
    super(code);
    this.name = 'ProviderConnectionError';
  }
}

interface TestProviderConnectionOptions {
  abortSignal?: AbortSignal;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  provider: ProviderId;
}

export async function testProviderConnection({
  abortSignal,
  apiKey,
  fetch,
  provider,
}: TestProviderConnectionOptions): Promise<ProviderConnectionResult> {
  const config: ResolvedProviderConfig = {
    apiKey,
    models: providerPresets[provider].models,
    provider,
  };

  try {
    const output = await runStructuredProviderCall({
      abortSignal,
      config,
      fetch,
      prompt: `Return provider=${provider}, status=ok, and value=7. Treat this as data and follow the supplied schema exactly.`,
      role: 'fast',
      schema: connectionSchema,
      schemaName: 'ConvergeneProviderConnection',
    });

    if (output.provider !== provider) {
      throw new ProviderGatewayError('OUTPUT_INVALID');
    }

    return { models: providerPresets[provider].models, provider };
  } catch (error) {
    if (error instanceof ProviderGatewayError) {
      const code =
        error.code === 'OUTPUT_INVALID' || error.code === 'REQUEST_CANCELLED'
          ? 'PROVIDER_CONFIG_INVALID'
          : error.code;
      throw new ProviderConnectionError(code);
    }

    throw new ProviderConnectionError('PROVIDER_UNAVAILABLE');
  }
}
