import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderId } from '@/modules/provider-config';

const cookieState = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieState.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) cookieState.delete(name);
      else cookieState.set(name, value);
    },
  }),
}));

import { POST as expandNode } from '@/app/api/ai/expand-node/route';
import {
  DELETE as deleteProviderConfig,
  PUT as saveProviderConfig,
} from '@/app/api/provider-config/route';
import {
  expandNodeOutputMatchesLocale,
  expandNodeResponseSchema,
} from '@/modules/meeting-ai/expand-node';
import { providerPresets, providerSessionCookieName } from '@/modules/provider-config/server';

const liveProviderCases: Array<{
  apiKeyEnvironmentVariable: string;
  modelEnvironmentVariable: string;
  provider: ProviderId;
}> = [
  {
    apiKeyEnvironmentVariable: 'STEPFUN_API_KEY',
    modelEnvironmentVariable: 'STEPFUN_VALIDATION_MODEL',
    provider: 'STEPFUN',
  },
  {
    apiKeyEnvironmentVariable: 'SILICONFLOW_API_KEY',
    modelEnvironmentVariable: 'SILICONFLOW_VALIDATION_MODEL',
    provider: 'SILICONFLOW',
  },
];

const testOrigin = 'http://localhost';
const encryptionSecret = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
const expansionMedianTargetMs = 3_000;

function request(path: string, method: 'DELETE' | 'POST' | 'PUT', body?: unknown): Request {
  const sessionId = cookieState.get(providerSessionCookieName);
  return new Request(`${testOrigin}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(sessionId ? { cookie: `${providerSessionCookieName}=${sessionId}` } : {}),
      origin: testOrigin,
    },
    method,
  });
}

async function configureProvider(provider: ProviderId, apiKey: string): Promise<void> {
  const response = await saveProviderConfig(
    request('/api/provider-config', 'PUT', { apiKey, provider }),
  );
  expect(response.status).toBe(200);
  expect(cookieState.get(providerSessionCookieName)).toBeDefined();
}

async function clearProvider(): Promise<void> {
  const response = await deleteProviderConfig(request('/api/provider-config', 'DELETE'));
  expect(response.status).toBe(200);
}

async function runExpansionRoute(requestId: string): Promise<number> {
  const response = await expandNode(
    request('/api/ai/expand-node', 'POST', {
      input: {
        briefSummary: 'Choose one fictional launch plan for a training exercise.',
        children: [],
        mode: 'DECISION',
        selectedNode: {
          id: 'fictional-topic-options',
          kind: 'TOPIC',
          title: 'Compare fictional launch options',
        },
        siblings: [],
        strategyId: 'DECISION_SURFACE_RISK',
      },
      outputLocale: 'en-US',
      requestId,
      task: 'expand-node',
    }),
  );

  expect(response.status).toBe(200);
  const serverTiming = response.headers.get('server-timing');
  expect(serverTiming).toMatch(/^expand;dur=\d+(?:\.\d)?$/u);
  const body = expandNodeResponseSchema.parse(await response.json());
  expect(body.requestId).toBe(requestId);
  expect(body.task).toBe('expand-node');
  expect(body.output.children.length).toBeGreaterThanOrEqual(2);
  expect(body.output.children.length).toBeLessThanOrEqual(4);
  expect(expandNodeOutputMatchesLocale(body.output, 'en-US')).toBe(true);
  return Number(serverTiming!.slice('expand;dur='.length));
}

beforeEach(() => {
  cookieState.clear();
  vi.stubEnv('APP_ENCRYPTION_SECRET', encryptionSecret);
  vi.stubEnv('CONVERGENE_E2E_PROVIDER_CONFIG', '1');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'live-expand-node-test-token');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.invalid');
});

afterEach(() => {
  cookieState.clear();
  vi.unstubAllEnvs();
});

describe('live expand-node route validation', () => {
  for (const probeCase of liveProviderCases) {
    const apiKey = process.env[probeCase.apiKeyEnvironmentVariable];
    const modelId = process.env[probeCase.modelEnvironmentVariable];
    const liveTest = apiKey && modelId ? it : it.skip;

    liveTest(
      `${probeCase.provider} completes configured-provider and expansion routes with the production schema`,
      async () => {
        expect(modelId).toBe(providerPresets[probeCase.provider].models.fast);
        await configureProvider(probeCase.provider, apiKey!);

        try {
          await runExpansionRoute('11111111-1111-4111-8111-111111111111');
        } finally {
          await clearProvider();
        }

        expect(cookieState.get(providerSessionCookieName)).toBeUndefined();
      },
      25_000,
    );
  }

  const stepFunApiKey = process.env.STEPFUN_API_KEY;
  const stepFunModelId = process.env.STEPFUN_VALIDATION_MODEL;
  const performanceTest = stepFunApiKey && stepFunModelId ? it : it.skip;
  performanceTest(
    'STEPFUN keeps the median of three production-route expansions within the interaction target',
    async () => {
      expect(stepFunModelId).toBe(providerPresets.STEPFUN.models.fast);
      await configureProvider('STEPFUN', stepFunApiKey!);
      const durations: number[] = [];

      try {
        for (const requestId of [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000003',
        ]) {
          durations.push(await runExpansionRoute(requestId));
        }
      } finally {
        await clearProvider();
      }

      const medianDurationMs = [...durations].sort((left, right) => left - right)[1]!;
      expect(medianDurationMs).toBeLessThanOrEqual(expansionMedianTargetMs);
    },
    55_000,
  );
});
