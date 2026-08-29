import { describe, expect, it } from 'vitest';

import {
  grillOutputFixtures,
  primaryPreparationModes,
  readinessDimensions,
} from '@/fixtures/preparation';

import {
  createEmptyKnownState,
  grillInputSchema,
  parseGrillOutput,
  validReadinessForMode,
  type GrillInput,
} from './ai-contract';

function input(mode: GrillInput['mode'], overrides: Partial<GrillInput> = {}): GrillInput {
  return {
    history: [],
    knownState: createEmptyKnownState(),
    mode,
    phase: 'DEFAULT',
    rawRequest: 'Choose a launch plan',
    turnIndex: 0,
    ...overrides,
  };
}

describe('preparation AI contracts', () => {
  it.each(primaryPreparationModes)('accepts the complete %s readiness fixture', (mode) => {
    expect(parseGrillOutput(input(mode), grillOutputFixtures[mode])).toEqual(
      grillOutputFixtures[mode],
    );
  });

  it('allows only two named custom dimensions for GENERAL', () => {
    expect(
      validReadinessForMode('GENERAL', [
        ...readinessDimensions('GENERAL'),
        { key: 'alignment', status: 'PARTIAL' },
        { key: 'follow_up', status: 'MISSING' },
      ]),
    ).toBe(true);
    expect(
      validReadinessForMode('GENERAL', [
        ...readinessDimensions('GENERAL'),
        { key: 'one', status: 'MISSING' },
        { key: 'two', status: 'MISSING' },
        { key: 'three', status: 'MISSING' },
      ]),
    ).toBe(false);
  });

  it('rejects the eleventh question, while an explicit finish can still produce a Brief', () => {
    const history = Array.from({ length: 10 }, () => ({
      disposition: 'SKIPPED' as const,
      question: 'A completed question',
    }));
    expect(
      grillInputSchema.safeParse(
        input('DECISION', { history, phase: 'USER_EXTENDED', turnIndex: 10 }),
      ).success,
    ).toBe(false);
    expect(
      grillInputSchema.safeParse(
        input('DECISION', {
          finishRequested: true,
          history,
          phase: 'USER_EXTENDED',
          turnIndex: 10,
        }),
      ).success,
    ).toBe(true);
  });

  it('requires the critical reason only for an actual critical extra question', () => {
    expect(() =>
      parseGrillOutput(
        input('DECISION', {
          phase: 'CRITICAL_EXTRA',
          turnIndex: 5,
          history: Array(5).fill({ disposition: 'SKIPPED', question: 'Done' }),
        }),
        grillOutputFixtures.DECISION,
      ),
    ).toThrow();
    expect(() =>
      parseGrillOutput(input('DECISION'), {
        ...grillOutputFixtures.DECISION,
        criticalExtraReason: 'Not allowed in the default phase',
      }),
    ).toThrow();
  });
});
