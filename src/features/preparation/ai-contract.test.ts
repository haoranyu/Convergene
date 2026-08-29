import { describe, expect, it } from 'vitest';

import {
  grillOutputFixtures,
  initialMapOutputFixtures,
  preparationBriefFixtures,
  primaryPreparationModes,
  readinessDimensions,
} from '@/fixtures/preparation';

import {
  createEmptyKnownState,
  grillInputSchema,
  initialMapOutputSchema,
  parseGrillOutput,
  parseProviderGrillOutput,
  parseProviderInitialMapOutput,
  providerInitialMapOutputSchema,
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
  it('normalizes provider nulls before enforcing the browser/domain contract', () => {
    const grillFixture = grillOutputFixtures.DECISION;
    expect(
      parseProviderGrillOutput({
        ...grillFixture,
        criticalExtraReason: null,
        readiness: {
          ...grillFixture.readiness,
          dimensions: grillFixture.readiness.dimensions.map((dimension) => ({
            ...dimension,
            summary: dimension.summary ?? null,
          })),
        },
        suggestedBrief: null,
      }),
    ).toEqual(grillFixture);

    const [objective, ...nodes] = initialMapOutputFixtures.DECISION.nodes;
    const topics = nodes.filter((node) => node.kind === 'TOPIC');
    const normalized = parseProviderInitialMapOutput({
      objective: { note: null, title: objective.title },
      templateCoverage: initialMapOutputFixtures.DECISION.templateCoverage,
      topics: topics.map((node) => ({
        note: null,
        title: node.title,
        topicPrompt: node.topicPrompt,
        transitionHint: node.transitionHint,
      })),
    });
    expect(normalized.nodes).toHaveLength(4);
    expect(normalized.nodes[0]).toEqual({
      key: 'objective',
      kind: 'OBJECTIVE',
      title: objective.title,
    });
    expect(normalized.nodes[1]).toMatchObject({
      key: 'topic-1',
      kind: 'TOPIC',
      order: 0,
      parentKey: 'objective',
    });
  });

  it('uses the graph title limit in both provider and domain schemas', () => {
    const title = '界'.repeat(49);
    expect(
      providerInitialMapOutputSchema.safeParse({
        objective: { title },
        templateCoverage: ['coverage'],
        topics: Array.from({ length: 3 }, (_, index) => ({
          title: `Topic ${index}`,
          topicPrompt: 'Discuss the topic',
          transitionHint: 'Move to the next topic',
        })),
      }).success,
    ).toBe(false);
    expect(
      initialMapOutputSchema.safeParse({
        nodes: [
          { key: 'objective', kind: 'OBJECTIVE', title },
          ...Array.from({ length: 3 }, (_, index) => ({
            key: `topic-${index}`,
            kind: 'TOPIC' as const,
            order: index,
            parentKey: 'objective',
            title: `Topic ${index}`,
            topicPrompt: 'Discuss the topic',
            transitionHint: 'Move to the next topic',
          })),
        ],
        templateCoverage: ['coverage'],
      }).success,
    ).toBe(false);

    const emojiTitle = '😀'.repeat(30);
    expect(
      providerInitialMapOutputSchema.safeParse({
        objective: { title: emojiTitle },
        templateCoverage: ['coverage'],
        topics: Array.from({ length: 3 }, (_, index) => ({
          title: `Topic ${index}`,
          topicPrompt: 'Discuss the topic',
          transitionHint: 'Move to the next topic',
        })),
      }).success,
    ).toBe(true);
  });

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
    const finishInput = input('DECISION', {
      finishRequested: true,
      history,
      phase: 'USER_EXTENDED',
      turnIndex: 10,
    });
    const snapshot = preparationBriefFixtures.DECISION;
    const brief = {
      assumptions: snapshot.assumptions,
      confirmed: snapshot.confirmed,
      desiredOutcome: snapshot.desiredOutcome,
      facilitation: snapshot.facilitation,
      objective: snapshot.objective,
      unknowns: snapshot.unknowns,
    };
    expect(
      parseGrillOutput(finishInput, {
        readiness: snapshot.readiness,
        shouldAsk: false,
        suggestedBrief: brief,
        updatedState: createEmptyKnownState(),
      }),
    ).toMatchObject({ readiness: { level: 'BARELY_READY' }, shouldAsk: false });
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
