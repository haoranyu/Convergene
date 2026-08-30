import { describe, expect, it, vi } from 'vitest';

import type { ConfiguredProviderCaller } from './configured-provider-call';
import { expandNodeProviderOutputSchema, expandNodeRequestSchema } from './expand-node';
import { runExpandNodeProviderTask } from './expand-node-task';
import { meetingAIErrorResponse } from './http';

const request = expandNodeRequestSchema.parse({
  input: {
    briefSummary: 'Choose one launch plan.',
    children: [],
    mode: 'DECISION',
    selectedNode: { id: 'topic-options', kind: 'TOPIC', title: 'Compare launch options' },
    siblings: [],
    strategyId: 'DECISION_SURFACE_RISK',
  },
  outputLocale: 'en-US',
  requestId: '11111111-1111-4111-8111-111111111111',
  task: 'expand-node',
});

describe('runExpandNodeProviderTask', () => {
  it('uses the bounded interactive task configuration', async () => {
    const output = {
      children: [
        { kind: 'RISK' as const, title: 'Budget approval may arrive too late' },
        { kind: 'RISK' as const, title: 'The launch owner lacks capacity' },
      ],
    };
    const callProvider = vi.fn().mockResolvedValue(output) as unknown as ConfiguredProviderCaller;

    await expect(runExpandNodeProviderTask(callProvider, request)).resolves.toEqual(output);
    expect(callProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 1_024,
        role: 'fast',
        schema: expandNodeProviderOutputSchema,
        schemaName: 'ExpandNodeOutput',
        timeoutMs: 15_000,
      }),
    );
  });

  it('rejects a provider response outside the narrow two-child task contract', async () => {
    const callProvider = vi.fn().mockResolvedValue({
      children: [
        { kind: 'RISK', title: 'Budget approval may arrive too late' },
        { kind: 'RISK', title: 'The launch owner lacks capacity' },
        { kind: 'RISK', title: 'The rollout window may close' },
      ],
    }) as unknown as ConfiguredProviderCaller;

    const task = runExpandNodeProviderTask(callProvider, request);
    await expect(task).rejects.toMatchObject({ code: 'OUTPUT_INVALID' });
    const response = meetingAIErrorResponse(await task.catch((error: unknown) => error));
    expect(response.status).toBe(422);
  });

  it('maps an overlong provider title to the public output-invalid contract', async () => {
    const callProvider = vi.fn().mockResolvedValue({
      children: [
        { kind: 'RISK', title: 'a'.repeat(49) },
        { kind: 'RISK', title: 'The launch owner lacks capacity' },
      ],
    }) as unknown as ConfiguredProviderCaller;

    const task = runExpandNodeProviderTask(callProvider, request);
    await expect(task).rejects.toMatchObject({ code: 'OUTPUT_INVALID' });
    const response = meetingAIErrorResponse(await task.catch((error: unknown) => error));
    expect(response.status).toBe(422);
  });

  it('rejects output in the wrong locale after provider validation', async () => {
    const callProvider = vi.fn().mockResolvedValue({
      children: [
        { kind: 'RISK', title: '预算审批可能太晚' },
        { kind: 'RISK', title: '负责人没有足够精力' },
      ],
    }) as unknown as ConfiguredProviderCaller;

    const task = runExpandNodeProviderTask(callProvider, request);
    await expect(task).rejects.toMatchObject({
      code: 'OUTPUT_LANGUAGE_MISMATCH',
    });
    const response = meetingAIErrorResponse(await task.catch((error: unknown) => error));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'OUTPUT_LANGUAGE_MISMATCH' },
      ok: false,
    });
  });
});
