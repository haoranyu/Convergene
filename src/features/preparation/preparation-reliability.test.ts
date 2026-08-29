import { describe, expect, it, vi } from 'vitest';

import { ProviderGatewayError } from '@/modules/meeting-ai/server';
import { validateInitialMap } from '@/modules/mind-map-domain';

import { materializeInitialMap } from './initial-map';
import { createGrillFewShotFixture, createInitialMapFewShotFixture } from './preparation-fallbacks';
import {
  runReliableGrillCall,
  runReliableInitialMapCall,
  type PreparationProviderCandidateCall,
} from './preparation-reliability';

describe('Preparation AI output reliability', () => {
  it('repairs the first invalid Grill candidate with its validation errors', async () => {
    const fixture = createGrillFewShotFixture('DECISION', 'en-US', 'ASK');
    const invalid = {
      ...fixture.output,
      readiness: {
        ...fixture.output.readiness,
        dimensions: fixture.output.readiness.dimensions.map((dimension) => ({
          ...dimension,
          key: `wrong_${dimension.key}`,
        })),
      },
    };
    const callProvider = vi
      .fn<PreparationProviderCandidateCall>()
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(fixture.output);

    await expect(
      runReliableGrillCall({ callProvider, input: fixture.input, outputLocale: 'en-US' }),
    ).resolves.toEqual(fixture.output);
    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(callProvider.mock.calls[1]?.[0]).toContain('PREVIOUS CANDIDATE');
    expect(callProvider.mock.calls[1]?.[0]).toContain('wrong_objective');
    expect(callProvider.mock.calls[1]?.[0]).toContain('readiness dimensions are invalid');
  });

  it('uses a valid question fallback after two invalid Grill candidates', async () => {
    const fixture = createGrillFewShotFixture('RETRO', 'zh-TW', 'ASK');
    const callProvider = vi
      .fn<PreparationProviderCandidateCall>()
      .mockResolvedValue({ unexpected: true });
    const output = await runReliableGrillCall({
      callProvider,
      input: fixture.input,
      outputLocale: 'zh-TW',
    });

    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(output).toMatchObject({ shouldAsk: true });
    expect(output.question).toContain('回顧');
  });

  it('uses a complete Brief fallback when finishing after two invalid candidates', async () => {
    const fixture = createGrillFewShotFixture('BRAINSTORM', 'zh-CN', 'COMPLETE');
    const callProvider = vi
      .fn<PreparationProviderCandidateCall>()
      .mockRejectedValue(new ProviderGatewayError('OUTPUT_INVALID'));
    const output = await runReliableGrillCall({
      callProvider,
      input: fixture.input,
      outputLocale: 'zh-CN',
    });

    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(output).toMatchObject({
      shouldAsk: false,
      suggestedBrief: { objective: '产生发布创意' },
    });
  });

  it('creates a deterministic valid three-topic map after two invalid candidates', async () => {
    const fixture = createInitialMapFewShotFixture('GENERAL', 'en-US');
    const callProvider = vi
      .fn<PreparationProviderCandidateCall>()
      .mockResolvedValue({ nodes: [], templateCoverage: [] });
    const output = await runReliableInitialMapCall({
      callProvider,
      input: fixture.input,
      outputLocale: 'en-US',
    });

    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(output.nodes.filter(({ kind }) => kind === 'TOPIC')).toHaveLength(3);
    expect(callProvider.mock.calls[1]?.[0]).toContain('unrecognized_keys');
    const graph = materializeInitialMap(output, 'meeting-1', {
      createId: (() => {
        let sequence = 0;
        return () => `fallback-${sequence++}`;
      })(),
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(validateInitialMap(graph).ok).toBe(true);
  });

  it('does not turn provider transport failures into fabricated content', async () => {
    const fixture = createGrillFewShotFixture('GENERAL', 'en-US', 'ASK');
    const callProvider = vi
      .fn<PreparationProviderCandidateCall>()
      .mockRejectedValue(new ProviderGatewayError('PROVIDER_AUTH_FAILED'));

    await expect(
      runReliableGrillCall({ callProvider, input: fixture.input, outputLocale: 'en-US' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    expect(callProvider).toHaveBeenCalledTimes(1);
  });
});
