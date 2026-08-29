import 'server-only';

import { z } from 'zod';

import { generatedTextMatchesLocale, ProviderGatewayError } from '@/modules/meeting-ai/server';
import type { SupportedLocale } from '@/modules/meeting-domain';

import {
  parseGrillOutput,
  parseProviderGrillOutput,
  parseProviderInitialMapOutput,
  type GrillInput,
  type GrillOutput,
  type InitialMapInput,
  type InitialMapOutput,
} from './ai-contract';
import {
  createDeterministicGrillFallback,
  createDeterministicInitialMapFallback,
} from './preparation-fallbacks';
import {
  buildGrillPrompt,
  buildGrillRepairPrompt,
  buildInitialMapPrompt,
  buildInitialMapRepairPrompt,
  grillOutputGeneratedText,
  initialMapOutputGeneratedText,
} from './preparation-prompts';

export type PreparationProviderCandidateCall = (prompt: string) => Promise<unknown>;

function compactZodIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length === 0 ? '$' : issue.path.join('.');
  if (issue.code === 'too_big') {
    return `${path}:${issue.code}:${String(issue.maximum)}`;
  }
  if (issue.code === 'too_small') {
    return `${path}:${issue.code}:${String(issue.minimum)}`;
  }
  if (issue.code === 'invalid_value') {
    return `${path}:invalid_value`;
  }
  if (issue.code === 'unrecognized_keys') {
    return `${path}:unrecognized_keys`;
  }
  return `${path}:${issue.code}:${issue.message.replaceAll(/\s+/g, ' ').slice(0, 120)}`;
}

export function compactValidationErrors(error: unknown): string[] {
  if (error instanceof z.ZodError) {
    return error.issues.slice(0, 8).map(compactZodIssue);
  }
  if (error instanceof ProviderGatewayError && error.code === 'OUTPUT_INVALID') {
    return ['$:provider_schema_invalid'];
  }
  return ['$:output_invalid'];
}

function validateGrillCandidate(
  input: GrillInput,
  outputLocale: SupportedLocale,
  candidate: unknown,
): GrillOutput {
  const output = parseGrillOutput(input, parseProviderGrillOutput(candidate));
  if (!generatedTextMatchesLocale(grillOutputGeneratedText(output), outputLocale)) {
    throw new z.ZodError([
      {
        code: 'custom',
        message: `generated fields must use ${outputLocale}`,
        path: ['generatedText'],
      },
    ]);
  }
  return output;
}

function validateInitialMapCandidate(
  outputLocale: SupportedLocale,
  candidate: unknown,
): InitialMapOutput {
  const output = parseProviderInitialMapOutput(candidate);
  if (!generatedTextMatchesLocale(initialMapOutputGeneratedText(output), outputLocale)) {
    throw new z.ZodError([
      {
        code: 'custom',
        message: `generated fields must use ${outputLocale}`,
        path: ['generatedText'],
      },
    ]);
  }
  return output;
}

function invalidProviderOutput(error: unknown): boolean {
  return error instanceof ProviderGatewayError && error.code === 'OUTPUT_INVALID';
}

export async function runReliableGrillCall(options: {
  callProvider: PreparationProviderCandidateCall;
  input: GrillInput;
  outputLocale: SupportedLocale;
}): Promise<GrillOutput> {
  let previousCandidate: unknown = null;
  let validationErrors: string[] = ['$:output_invalid'];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt =
      attempt === 0
        ? buildGrillPrompt(options.input, options.outputLocale)
        : buildGrillRepairPrompt(
            options.input,
            options.outputLocale,
            previousCandidate,
            validationErrors,
          );
    try {
      const candidate = await options.callProvider(prompt);
      previousCandidate = candidate;
      try {
        return validateGrillCandidate(options.input, options.outputLocale, candidate);
      } catch (error) {
        validationErrors = compactValidationErrors(error);
      }
    } catch (error) {
      if (!invalidProviderOutput(error)) throw error;
      previousCandidate = null;
      validationErrors = compactValidationErrors(error);
    }
  }

  return validateGrillCandidate(
    options.input,
    options.outputLocale,
    createDeterministicGrillFallback(options.input, options.outputLocale),
  );
}

export async function runReliableInitialMapCall(options: {
  callProvider: PreparationProviderCandidateCall;
  input: InitialMapInput;
  outputLocale: SupportedLocale;
}): Promise<InitialMapOutput> {
  let previousCandidate: unknown = null;
  let validationErrors: string[] = ['$:output_invalid'];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt =
      attempt === 0
        ? buildInitialMapPrompt(options.input, options.outputLocale)
        : buildInitialMapRepairPrompt(
            options.input,
            options.outputLocale,
            previousCandidate,
            validationErrors,
          );
    try {
      const candidate = await options.callProvider(prompt);
      previousCandidate = candidate;
      try {
        return validateInitialMapCandidate(options.outputLocale, candidate);
      } catch (error) {
        validationErrors = compactValidationErrors(error);
      }
    } catch (error) {
      if (!invalidProviderOutput(error)) throw error;
      previousCandidate = null;
      validationErrors = compactValidationErrors(error);
    }
  }

  const fallback = createDeterministicInitialMapFallback(options.input, options.outputLocale);
  if (!generatedTextMatchesLocale(initialMapOutputGeneratedText(fallback), options.outputLocale)) {
    throw new ProviderGatewayError('OUTPUT_INVALID');
  }
  return fallback;
}
