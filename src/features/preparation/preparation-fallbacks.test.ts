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
});
