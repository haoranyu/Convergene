import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  callProvider: vi.fn(),
  createRuntime: vi.fn(),
  enforceRateLimit: vi.fn(),
  readJsonInput: vi.fn(),
  resolveProvider: vi.fn(),
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
  return { ...actual, resolveConfiguredProviderCaller: mocks.resolveProvider };
});

vi.mock('@/modules/provider-config/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/provider-config/server')>();
  return { ...actual, createProviderConfigRuntime: mocks.createRuntime };
});

import { POST } from './route';

const preloadedConfig = {
  key: `provider-config:${'a'.repeat(64)}`,
  record: { version: 2 },
};
const runtimeService = {};
const runtimeStore = {};

function request(): Request {
  return new Request('http://localhost/api/ai/classify-meeting', {
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readJsonInput.mockResolvedValue({
    input: { rawRequest: 'Choose one launch plan.' },
    outputLocale: 'en-US',
    requestId: '11111111-1111-4111-8111-111111111111',
    task: 'classify-meeting',
  });
  mocks.createRuntime.mockResolvedValue({ service: runtimeService, store: runtimeStore });
  mocks.enforceRateLimit.mockResolvedValue({ config: preloadedConfig });
  mocks.resolveProvider.mockResolvedValue(mocks.callProvider);
  mocks.callProvider.mockResolvedValue({
    confidence: 'HIGH',
    reason: 'The request requires one concrete choice.',
    recommendedMode: 'DECISION',
    suggestedTitle: 'Choose the launch plan',
  });
});

describe('classify-meeting route', () => {
  it('reuses the configuration preloaded by the atomic rate-limit claim', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      runtimeStore,
      20,
      60,
      'classify-meeting',
    );
    expect(mocks.resolveProvider).toHaveBeenCalledWith(runtimeService, 'fast', preloadedConfig);
    expect(mocks.callProvider).toHaveBeenCalledWith(
      expect.objectContaining({ schemaName: 'ClassifyMeetingOutput' }),
    );
  });
});
