import type {
  ProviderConfigApiResponse,
  ProviderConfigInput,
  ProviderConfigSummary,
  ProviderConnectionResult,
} from '@/modules/provider-config';
import {
  providerConfigApiResponseSchema,
  providerConfigSummarySchema,
  providerConnectionResultSchema,
} from '@/modules/provider-config';
import type { z } from 'zod';

type FetchImplementation = typeof fetch;

export interface ProviderConfigClient {
  deleteConfig(): Promise<ProviderConfigApiResponse<ProviderConfigSummary>>;
  getStatus(): Promise<ProviderConfigApiResponse<ProviderConfigSummary>>;
  saveConfig(input: ProviderConfigInput): Promise<ProviderConfigApiResponse<ProviderConfigSummary>>;
  testConnection(
    input: ProviderConfigInput,
  ): Promise<ProviderConfigApiResponse<ProviderConnectionResult>>;
}

const fallbackFailure = {
  error: { code: 'PROVIDER_UNAVAILABLE' as const },
  ok: false as const,
};

function normalizeApiResponse<Value>(
  value: unknown,
  valueSchema: z.ZodType<Value>,
): ProviderConfigApiResponse<Value> | null {
  const parsed = providerConfigApiResponseSchema(valueSchema).safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function request<Value>(
  fetchImplementation: FetchImplementation,
  path: string,
  init: RequestInit,
  valueSchema: z.ZodType<Value>,
): Promise<ProviderConfigApiResponse<Value>> {
  try {
    const response = await fetchImplementation(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
    const payload: unknown = await response.json().catch(() => null);

    return normalizeApiResponse(payload, valueSchema) ?? fallbackFailure;
  } catch {
    return fallbackFailure;
  }
}

export function createProviderConfigClient(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): ProviderConfigClient {
  return {
    deleteConfig: () =>
      request(
        fetchImplementation,
        '/api/provider-config',
        {
          method: 'DELETE',
        },
        providerConfigSummarySchema,
      ),
    getStatus: () =>
      request(
        fetchImplementation,
        '/api/provider-config/status',
        {
          method: 'GET',
        },
        providerConfigSummarySchema,
      ),
    saveConfig: (input) =>
      request(
        fetchImplementation,
        '/api/provider-config',
        {
          body: JSON.stringify(input),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
        providerConfigSummarySchema,
      ),
    testConnection: (input) =>
      request(
        fetchImplementation,
        '/api/provider-config/test',
        {
          body: JSON.stringify(input),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
        providerConnectionResultSchema,
      ),
  };
}

export const providerConfigClient = createProviderConfigClient();
