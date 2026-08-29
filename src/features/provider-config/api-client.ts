import type {
  ProviderConfigApiResponse,
  ProviderConfigErrorCode,
  ProviderConfigInput,
  ProviderConfigSummary,
  ProviderConnectionResult,
} from '@/modules/provider-config';

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

const errorCodes = new Set<ProviderConfigErrorCode>([
  'INPUT_INVALID',
  'ORIGIN_INVALID',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_CONFIG_INVALID',
  'PROVIDER_CONFIG_UNAVAILABLE',
  'PROVIDER_MODEL_NOT_FOUND',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
]);

function normalizeApiResponse<Value>(value: unknown): ProviderConfigApiResponse<Value> | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    return null;
  }

  if (value.ok === true && 'value' in value) {
    return { ok: true, value: value.value as Value };
  }

  const candidateError = 'error' in value ? value.error : null;

  if (
    value.ok !== false ||
    typeof candidateError !== 'object' ||
    candidateError === null ||
    !('code' in candidateError) ||
    typeof candidateError.code !== 'string' ||
    !errorCodes.has(candidateError.code as ProviderConfigErrorCode)
  ) {
    return null;
  }

  return {
    error: { code: candidateError.code as ProviderConfigErrorCode },
    ok: false,
  };
}

async function request<Value>(
  fetchImplementation: FetchImplementation,
  path: string,
  init: RequestInit,
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

    return normalizeApiResponse<Value>(payload) ?? fallbackFailure;
  } catch {
    return fallbackFailure;
  }
}

export function createProviderConfigClient(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): ProviderConfigClient {
  return {
    deleteConfig: () =>
      request(fetchImplementation, '/api/provider-config', {
        method: 'DELETE',
      }),
    getStatus: () =>
      request(fetchImplementation, '/api/provider-config/status', {
        method: 'GET',
      }),
    saveConfig: (input) =>
      request(fetchImplementation, '/api/provider-config', {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
    testConnection: (input) =>
      request(fetchImplementation, '/api/provider-config/test', {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
  };
}

export const providerConfigClient = createProviderConfigClient();
