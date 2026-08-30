import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  createRuntime: vi.fn(),
  enforceRateLimit: vi.fn(),
  readJsonInput: vi.fn(),
  resolveProvider: vi.fn(),
  runTask: vi.fn(),
}));

vi.mock('@/modules/api-security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/api-security')>();
  return {
    ...actual,
    assertSameOrigin: mocks.assertSameOrigin,
    enforceProviderConfigRateLimit: mocks.enforceRateLimit,
    readJsonInput: mocks.readJsonInput,
  };
});

vi.mock('@/modules/meeting-ai/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/meeting-ai/server')>();
  return {
    ...actual,
    resolveConfiguredProviderCaller: mocks.resolveProvider,
    runExpandNodeProviderTask: mocks.runTask,
  };
});

vi.mock('@/modules/provider-config/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/provider-config/server')>();
  return { ...actual, createProviderConfigRuntime: mocks.createRuntime };
});

import { POST } from './route';

const envelope = {
  input: {
    briefSummary: 'Choose one fictional plan.',
    children: [],
    mode: 'DECISION',
    selectedNode: { id: 'topic', kind: 'TOPIC', title: 'Compare options' },
    siblings: [],
    strategyId: 'DECISION_SURFACE_RISK',
  },
  outputLocale: 'en-US',
  requestId: '11111111-1111-4111-8111-111111111111',
  task: 'expand-node',
} as const;

const output = {
  children: [
    { kind: 'RISK', title: 'Budget approval may arrive late' },
    { kind: 'RISK', title: 'The launch owner may lack capacity' },
  ],
} as const;

const preloadedConfig = {
  key: `provider-config:${'a'.repeat(64)}`,
  record: { version: 2 },
};

const runtimeService = {};
const runtimeStore = {};

function request(): Request {
  return new Request('http://localhost/api/ai/expand-node', {
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    method: 'POST',
  });
}

function timingNames(response: Response): string[] {
  return response.headers
    .get('server-timing')!
    .split(', ')
    .map((metric) => metric.split(';', 1)[0]!);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readJsonInput.mockResolvedValue(envelope);
  mocks.createRuntime.mockResolvedValue({ service: runtimeService, store: runtimeStore });
  mocks.enforceRateLimit.mockResolvedValue({ config: preloadedConfig });
  mocks.resolveProvider.mockResolvedValue(vi.fn());
  mocks.runTask.mockResolvedValue(output);
});

describe('expand-node route timing stages', () => {
  it('reports every fixed safe stage after a successful request', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(timingNames(response)).toEqual(['expand', 'rate', 'config', 'provider']);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      runtimeStore,
      20,
      60,
      'expand-node',
    );
    expect(mocks.resolveProvider).toHaveBeenCalledWith(runtimeService, 'fast', preloadedConfig);
  });

  it.each([
    ['input', mocks.readJsonInput, ['expand']],
    ['rate', mocks.enforceRateLimit, ['expand', 'rate']],
    ['config', mocks.resolveProvider, ['expand', 'rate', 'config']],
    ['provider', mocks.runTask, ['expand', 'rate', 'config', 'provider']],
  ] as const)('reports only stages that began before a %s failure', async (_stage, mock, names) => {
    mock.mockRejectedValueOnce(new Error('safe synthetic failure'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(timingNames(response)).toEqual(names);
    expect(response.headers.get('server-timing')).not.toContain('safe synthetic failure');
  });
});
