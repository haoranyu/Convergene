import { describe, expect, it } from 'vitest';

import { meetingModes, supportedLocales } from '@/modules/meeting-domain';
import { generatedTextMatchesLocale } from '@/modules/meeting-ai';
import { validateInitialMap } from '@/modules/mind-map-domain';

import {
  initialMapInputSchema,
  parseGrillOutput,
  parseProviderGrillOutput,
  parseProviderInitialMapOutput,
  providerInitialMapOutputSchema,
} from './ai-contract';
import { materializeInitialMap } from './initial-map';
import {
  createDeterministicGrillFallback,
  createDeterministicInitialMapFallback,
  createGrillFewShotFixture,
  createInitialMapFewShotFixture,
  grillOutputBranches,
} from './preparation-fallbacks';
import { grillOutputGeneratedText, initialMapOutputGeneratedText } from './preparation-prompts';

describe('Preparation prompt fixtures', () => {
  for (const mode of meetingModes) {
    for (const locale of supportedLocales) {
      for (const branch of grillOutputBranches) {
        it(`validates the ${mode} ${locale} ${branch} Grill example`, () => {
          const fixture = createGrillFewShotFixture(mode, locale, branch);
          const output = parseGrillOutput(fixture.input, parseProviderGrillOutput(fixture.output));
          expect(generatedTextMatchesLocale(grillOutputGeneratedText(output), locale)).toBe(true);
          expect(output.shouldAsk).toBe(branch === 'ASK');
        });
      }

      it(`validates the ${mode} ${locale} Initial Map example`, () => {
        const fixture = createInitialMapFewShotFixture(mode, locale);
        expect(initialMapInputSchema.safeParse(fixture.input).success).toBe(true);
        expect(providerInitialMapOutputSchema.safeParse(fixture.output).success).toBe(true);
        const output = parseProviderInitialMapOutput(fixture.output);
        expect(generatedTextMatchesLocale(initialMapOutputGeneratedText(output), locale)).toBe(
          true,
        );
        const graph = materializeInitialMap(output, 'meeting-1', {
          createId: (() => {
            let sequence = 0;
            return () => `fixture-${sequence++}`;
          })(),
          now: new Date('2026-01-01T00:00:00.000Z'),
        });
        expect(validateInitialMap(graph).ok).toBe(true);
      });
    }
  }

  it('preserves answered history and does not repeat the first fallback question', () => {
    const first = createGrillFewShotFixture('DECISION', 'en-US', 'ASK');
    const nextInput = {
      ...first.input,
      history: [
        {
          answer: 'The product sponsor owns the decision.',
          disposition: 'ANSWERED' as const,
          question: first.output.question!,
        },
      ],
      turnIndex: 1,
    };
    const next = createDeterministicGrillFallback(nextInput, 'en-US');
    expect(next.question).not.toBe(first.output.question);
    expect(next.updatedState.confirmed).toContain('The product sponsor owns the decision.');

    const completed = createDeterministicGrillFallback(
      { ...nextInput, finishRequested: true },
      'en-US',
    );
    expect(completed.suggestedBrief?.confirmed).toContain('The product sponsor owns the decision.');
  });

  it.each([
    ['en-US', 'Who owns the final decision?'],
    ['zh-CN', '谁负责做出最终决策？'],
    ['zh-TW', '誰負責做出最終決策？'],
  ] as const)('localizes the %s deterministic decision-owner question', (locale, question) => {
    const fixture = createGrillFewShotFixture('DECISION', locale, 'ASK');
    const output = createDeterministicGrillFallback(fixture.input, locale);

    expect(output).toMatchObject({
      options: expect.arrayContaining([
        expect.objectContaining({ label: expect.any(String), value: 'named_decision_maker' }),
      ]),
      question,
      questionType: 'SINGLE_CHOICE',
    });
    expect(generatedTextMatchesLocale(grillOutputGeneratedText(output), locale)).toBe(true);
  });

  it('keeps valid multi-code-unit titles up to the grapheme limit', () => {
    const fixture = createInitialMapFewShotFixture('GENERAL', 'en-US');
    const objective = '😀'.repeat(30);
    const output = createDeterministicInitialMapFallback(
      { ...fixture.input, brief: { ...fixture.input.brief, objective } },
      'en-US',
    );
    expect(output.nodes[0]?.title).toBe(objective);
  });
});
