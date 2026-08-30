import { describe, expect, it } from 'vitest';

import {
  runProviderStructuredOutputProbe,
  type ValidationProvider,
} from './provider-structured-output';

const liveProviderCases: Array<{
  apiKeyEnvironmentVariable: string;
  approvedModelId: string;
  modelEnvironmentVariable: string;
  provider: ValidationProvider;
}> = [
  {
    apiKeyEnvironmentVariable: 'STEPFUN_API_KEY',
    approvedModelId: 'step-3.7-flash',
    modelEnvironmentVariable: 'STEPFUN_VALIDATION_MODEL',
    provider: 'STEPFUN',
  },
  {
    apiKeyEnvironmentVariable: 'SILICONFLOW_API_KEY',
    approvedModelId: 'Qwen/Qwen3.5-4B',
    modelEnvironmentVariable: 'SILICONFLOW_VALIDATION_MODEL',
    provider: 'SILICONFLOW',
  },
];
const liveProviderTestTimeoutMs = 35_000;
const invalidValidationModelId = 'convergene-integration-validation-model-does-not-exist';

describe('live provider structured-output validation', () => {
  for (const probeCase of liveProviderCases) {
    const apiKey = process.env[probeCase.apiKeyEnvironmentVariable];
    const modelId = process.env[probeCase.modelEnvironmentVariable];
    const liveTest = apiKey && modelId ? it : it.skip;

    liveTest(
      `${probeCase.provider} streams the minimal schema within the timeout`,
      async () => {
        expect(modelId).toBe(probeCase.approvedModelId);

        const result = await runProviderStructuredOutputProbe({
          apiKey: apiKey!,
          modelId: modelId!,
          provider: probeCase.provider,
        });

        expect(result.schemaAccepted).toBe(true);
        expect(result.modelId).toBe(probeCase.approvedModelId);
        expect(result.streamChunkCount).toBeGreaterThan(0);
        expect(result.firstChunkLatencyMs).toBeGreaterThan(0);
        expect(result.totalLatencyMs).toBeGreaterThanOrEqual(result.firstChunkLatencyMs);
      },
      liveProviderTestTimeoutMs,
    );

    liveTest(
      `${probeCase.provider} cancels a real target-model call before the test timeout`,
      async () => {
        expect(modelId).toBe(probeCase.approvedModelId);

        await expect(
          runProviderStructuredOutputProbe({
            apiKey: apiKey!,
            modelId: modelId!,
            provider: probeCase.provider,
            timeoutMs: 1,
          }),
        ).rejects.toMatchObject({
          code: 'PROVIDER_PROBE_FAILED',
          failureKind: 'TIMEOUT',
        });
      },
      liveProviderTestTimeoutMs,
    );

    liveTest(
      `${probeCase.provider} normalizes a real invalid-model response`,
      async () => {
        expect(modelId).toBe(probeCase.approvedModelId);

        await expect(
          runProviderStructuredOutputProbe({
            apiKey: apiKey!,
            modelId: invalidValidationModelId,
            provider: probeCase.provider,
          }),
        ).rejects.toMatchObject({
          code: 'PROVIDER_PROBE_FAILED',
          failureKind: 'PROVIDER_ERROR',
        });
      },
      liveProviderTestTimeoutMs,
    );
  }
});
