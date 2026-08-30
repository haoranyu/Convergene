import { describe, expect, it } from 'vitest';

import { preparationBriefFixtures } from '@/fixtures/preparation';
import {
  parseProviderGrillOutput,
  parseProviderInitialMapOutput,
  parseGrillOutput,
  providerGrillOutputSchema,
  providerInitialMapOutputSchema,
  type GrillInput,
} from '@/features/preparation/ai-contract';
import {
  buildGrillPrompt,
  buildInitialMapPrompt,
} from '@/features/preparation/preparation-prompts';
import { runStructuredProviderCall } from '@/modules/meeting-ai/provider-adapter';
import { providerPresets } from '@/modules/provider-config/server';

const stepFunApiKey = process.env.STEPFUN_API_KEY;
const stepFunModelId = process.env.STEPFUN_PREPARATION_VALIDATION_MODEL;
const liveTest = stepFunApiKey && stepFunModelId ? it : it.skip;

const grillInput: GrillInput = {
  history: [],
  knownState: { assumptions: [], confirmed: [], unknowns: [] },
  mode: 'DECISION',
  phase: 'DEFAULT',
  rawRequest: 'Choose one fictional rollout plan for a training exercise.',
  turnIndex: 0,
};

describe('live StepFun preparation contracts', () => {
  liveTest(
    'accepts the production Grill and initial-map prompts with their full provider schemas',
    async () => {
      expect(stepFunModelId).toBe(providerPresets.STEPFUN.models.grill);
      const config = {
        apiKey: stepFunApiKey!,
        models: providerPresets.STEPFUN.models,
        provider: 'STEPFUN' as const,
      };

      const grillOutput = await runStructuredProviderCall({
        config,
        maxOutputTokens: 4_096,
        prompt: buildGrillPrompt(grillInput, 'en-US'),
        role: 'grill',
        schema: providerGrillOutputSchema,
        schemaName: 'GrillOutput',
        timeoutMs: 45_000,
      });
      expect(() =>
        parseGrillOutput(grillInput, parseProviderGrillOutput(grillOutput)),
      ).not.toThrow();

      const initialMapOutput = await runStructuredProviderCall({
        config,
        maxOutputTokens: 8_192,
        prompt: buildInitialMapPrompt(
          { brief: preparationBriefFixtures.DECISION, mode: 'DECISION' },
          'en-US',
        ),
        role: 'grill',
        schema: providerInitialMapOutputSchema,
        schemaName: 'InitialMapContent',
        timeoutMs: 60_000,
      });
      expect(() => parseProviderInitialMapOutput(initialMapOutput)).not.toThrow();
    },
    120_000,
  );
});
