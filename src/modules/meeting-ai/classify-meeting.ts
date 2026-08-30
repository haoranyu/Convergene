import { z } from 'zod';

import { meetingModes, supportedLocales } from '@/modules/meeting-domain';

export {
  meetingAIErrorCodeSchema,
  meetingAIErrorCodes,
  meetingAIErrorResponseSchema,
  type MeetingAIError,
  type MeetingAIErrorCode,
  type MeetingAIResult,
} from './error-contract';

export const classifyMeetingTask = 'classify-meeting' as const;
export const classifyMeetingMaximumRequestBodyBytes = 24_576;

export const classifyMeetingInputSchema = z
  .object({
    rawRequest: z.string().trim().min(1).max(4_000),
    userTitle: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function titleWithinLimit(title: string): boolean {
  const normalized = title.trim();
  if (normalized === '') return false;
  if (cjkPattern.test(normalized)) {
    return (
      [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(normalized)].length <=
      24
    );
  }
  return normalized.split(/\s+/u).length <= 10;
}

function isSingleSentence(value: string): boolean {
  const segments = [
    ...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(value.trim()),
  ].filter(({ segment }) => /[\p{L}\p{N}]/u.test(segment));
  return segments.length === 1;
}

export const classifyMeetingOutputSchema = z
  .object({
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .refine((value) => !/[\r\n]/u.test(value))
      .refine(isSingleSentence, { message: 'Reason must be one sentence' }),
    recommendedMode: z.enum(meetingModes),
    suggestedTitle: z.string().trim().min(1).max(160).refine(titleWithinLimit),
  })
  .strict()
  .refine((value) => value.confidence !== 'LOW' || value.recommendedMode === 'GENERAL', {
    message: 'LOW confidence must use GENERAL',
    path: ['recommendedMode'],
  });

export type ClassifyMeetingInput = z.infer<typeof classifyMeetingInputSchema>;
export type ClassifyMeetingOutput = z.infer<typeof classifyMeetingOutputSchema>;

export const classifyMeetingRequestSchema = z
  .object({
    input: classifyMeetingInputSchema,
    outputLocale: z.enum(supportedLocales),
    requestId: z.uuid(),
    task: z.literal(classifyMeetingTask),
  })
  .strict();

export const classifyMeetingResponseSchema = z
  .object({
    output: classifyMeetingOutputSchema,
    requestId: z.uuid(),
    task: z.literal(classifyMeetingTask),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ClassifyMeetingRequest = z.infer<typeof classifyMeetingRequestSchema>;
export type ClassifyMeetingResponse = z.infer<typeof classifyMeetingResponseSchema>;

const simplifiedOnlyPattern = /[这为发会选从与后个们现该让时问产实将开达过进还边]/gu;
const traditionalOnlyPattern = /[這為發會選從與後個們現該讓時問產實將開達過進還邊]/gu;

function matches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

export function classifyMeetingOutputMatchesLocale(
  output: ClassifyMeetingOutput,
  outputLocale: (typeof supportedLocales)[number],
): boolean {
  return generatedTextMatchesLocale(`${output.suggestedTitle} ${output.reason}`, outputLocale);
}

export function generatedTextMatchesLocale(
  generatedText: string,
  outputLocale: (typeof supportedLocales)[number],
): boolean {
  const hanCount = matches(generatedText, /\p{Script=Han}/gu);
  const latinCount = matches(generatedText, /\p{Script=Latin}/gu);

  if (outputLocale === 'en-US') {
    return hanCount < 2 || latinCount >= 8;
  }
  if (hanCount === 0 && latinCount >= 2) {
    return false;
  }

  const simplifiedCount = matches(generatedText, simplifiedOnlyPattern);
  const traditionalCount = matches(generatedText, traditionalOnlyPattern);
  return outputLocale === 'zh-TW'
    ? simplifiedCount < 2 || traditionalCount > 0
    : traditionalCount < 2 || simplifiedCount > 0;
}

export class MeetingAIContractError extends Error {
  readonly code: 'OUTPUT_INVALID' | 'OUTPUT_LANGUAGE_MISMATCH';

  constructor(code: 'OUTPUT_INVALID' | 'OUTPUT_LANGUAGE_MISMATCH' = 'OUTPUT_LANGUAGE_MISMATCH') {
    super(code);
    this.code = code;
    this.name = 'MeetingAIContractError';
  }
}
