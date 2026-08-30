import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupportedLocale } from '@/modules/meeting-domain';
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

import { POST as classifyMeeting } from '@/app/api/ai/classify-meeting/route';
import { POST as expandNode } from '@/app/api/ai/expand-node/route';
import {
  DELETE as deleteProviderConfig,
  PUT as saveProviderConfig,
} from '@/app/api/provider-config/route';
import {
  classifyMeetingOutputMatchesLocale,
  classifyMeetingResponseSchema,
} from '@/modules/meeting-ai/classify-meeting';
import {
  expandNodeOutputMatchesLocale,
  expandNodeResponseSchema,
  meetingAIErrorResponseSchema,
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

type ExpansionRouteSample =
  | { durationMs: number; locale: SupportedLocale; ok: true; sample: number; status: number }
  | {
      code: string;
      durationMs: number;
      locale: SupportedLocale;
      ok: false;
      outputFailure?: string;
      sample: number;
      status: number;
    };

type ClassificationRouteSample =
  | { locale: SupportedLocale; ok: true; status: number }
  | {
      code: string;
      locale: SupportedLocale;
      ok: false;
      outputFailure?: string;
      status: number;
    };

async function runClassificationRoute(
  locale: SupportedLocale,
  requestId: string,
): Promise<ClassificationRouteSample> {
  const response = await classifyMeeting(
    request('/api/ai/classify-meeting', 'POST', {
      input: {
        rawRequest:
          locale === 'en-US'
            ? 'Choose one fictional launch plan for a training exercise.'
            : '为一次虚构培训演练选择一个发布方案。',
      },
      outputLocale: locale,
      requestId,
      task: 'classify-meeting',
    }),
  );
  const rawBody = (await response.json()) as unknown;
  if (!response.ok) {
    const failure = meetingAIErrorResponseSchema.safeParse(rawBody);
    return {
      code: failure.success ? failure.data.error.code : 'UNKNOWN',
      locale,
      ok: false,
      ...(failure.success &&
      failure.data.error.code === 'OUTPUT_INVALID' &&
      failure.data.error.outputFailure !== undefined
        ? { outputFailure: failure.data.error.outputFailure }
        : {}),
      status: response.status,
    };
  }

  const body = classifyMeetingResponseSchema.safeParse(rawBody);
  if (
    !body.success ||
    body.data.requestId !== requestId ||
    body.data.task !== 'classify-meeting' ||
    body.data.output.recommendedMode !== 'DECISION'
  ) {
    return { code: 'OUTPUT_INVALID', locale, ok: false, status: response.status };
  }
  if (!classifyMeetingOutputMatchesLocale(body.data.output, locale)) {
    return { code: 'OUTPUT_LANGUAGE_MISMATCH', locale, ok: false, status: response.status };
  }

  return { locale, ok: true, status: response.status };
}

async function runExpansionRoute(
  locale: SupportedLocale,
  requestId: string,
  sample: number,
): Promise<ExpansionRouteSample> {
  const isEnglish = locale === 'en-US';
  const response = await expandNode(
    request('/api/ai/expand-node', 'POST', {
      input: {
        briefSummary: isEnglish
          ? 'Choose one fictional launch plan for a training exercise.'
          : '为一次虚构培训演练选择一个发布方案。',
        children: [],
        mode: 'DECISION',
        selectedNode: {
          id: 'fictional-topic-options',
          kind: 'TOPIC',
          title: isEnglish ? 'Compare fictional launch options' : '比较虚构的发布方案',
        },
        siblings: [],
        strategyId: 'DECISION_SURFACE_RISK',
      },
      outputLocale: locale,
      requestId,
      task: 'expand-node',
    }),
  );

  const serverTiming = response.headers.get('server-timing');
  expect(serverTiming).toMatch(
    /^expand;dur=\d+(?:\.\d)?, rate;dur=\d+(?:\.\d)?, config;dur=\d+(?:\.\d)?, provider;dur=\d+(?:\.\d)?$/u,
  );
  const durationMs = Number(serverTiming!.match(/(?:^|, )expand;dur=(\d+(?:\.\d)?)/u)![1]);
  const rawBody = (await response.json()) as unknown;
  if (!response.ok) {
    const failure = meetingAIErrorResponseSchema.safeParse(rawBody);
    return {
      code: failure.success ? failure.data.error.code : 'UNKNOWN',
      durationMs,
      locale,
      ok: false,
      ...(failure.success &&
      failure.data.error.code === 'OUTPUT_INVALID' &&
      failure.data.error.outputFailure !== undefined
        ? { outputFailure: failure.data.error.outputFailure }
        : {}),
      sample,
      status: response.status,
    };
  }

  const body = expandNodeResponseSchema.safeParse(rawBody);
  if (
    !body.success ||
    body.data.requestId !== requestId ||
    body.data.task !== 'expand-node' ||
    body.data.output.children.length !== 2 ||
    !body.data.output.children.every(
      (child) => Object.keys(child).sort().join(',') === 'kind,title',
    )
  ) {
    return {
      code: 'OUTPUT_INVALID',
      durationMs,
      locale,
      ok: false,
      sample,
      status: response.status,
    };
  }
  if (!expandNodeOutputMatchesLocale(body.data.output, locale)) {
    return {
      code: 'OUTPUT_LANGUAGE_MISMATCH',
      durationMs,
      locale,
      ok: false,
      sample,
      status: response.status,
    };
  }

  return { durationMs, locale, ok: true, sample, status: response.status };
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

describe('live fast-role route validation', () => {
  for (const [providerIndex, probeCase] of liveProviderCases.entries()) {
    const apiKey = process.env[probeCase.apiKeyEnvironmentVariable];
    const modelId = process.env[probeCase.modelEnvironmentVariable];
    const liveTest = apiKey && modelId ? it : it.skip;

    liveTest(
      `${probeCase.provider} completes classifications and three expansions per locale with the production fast role`,
      async () => {
        expect(modelId).toBe(providerPresets[probeCase.provider].models.fast);
        await configureProvider(probeCase.provider, apiKey!);
        const classifications: ClassificationRouteSample[] = [];
        const samples: ExpansionRouteSample[] = [];

        try {
          classifications.push(
            await runClassificationRoute(
              'en-US',
              `10000000-0000-4000-8${providerIndex}00-000000000001`,
            ),
            await runClassificationRoute(
              'zh-CN',
              `10000000-0000-4000-8${providerIndex}00-000000000002`,
            ),
          );
          for (const [localeIndex, locale] of (['en-US', 'zh-CN'] as const).entries()) {
            for (const sample of [1, 2, 3]) {
              samples.push(
                await runExpansionRoute(
                  locale,
                  `00000000-0000-4000-8${providerIndex}${localeIndex}0-${String(sample).padStart(12, '0')}`,
                  sample,
                ),
              );
            }
          }
        } finally {
          await clearProvider();
        }

        expect(cookieState.get(providerSessionCookieName)).toBeUndefined();
        expect(classifications).toEqual([
          { locale: 'en-US', ok: true, status: 200 },
          { locale: 'zh-CN', ok: true, status: 200 },
        ]);
        expect(samples).toEqual(
          (['en-US', 'zh-CN'] as const).flatMap((locale) =>
            [1, 2, 3].map((sample) => ({
              durationMs: expect.any(Number),
              locale,
              ok: true,
              sample,
              status: 200,
            })),
          ),
        );
        for (const locale of ['en-US', 'zh-CN'] as const) {
          const medianDurationMs = samples
            .filter((sample) => sample.locale === locale)
            .map(({ durationMs }) => durationMs)
            .sort((left, right) => left - right)[1]!;
          expect(medianDurationMs).toBeLessThanOrEqual(expansionMedianTargetMs);
        }
      },
      80_000,
    );
  }
});
