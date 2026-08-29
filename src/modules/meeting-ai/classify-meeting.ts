import { z } from 'zod';

import { meetingModes } from '@/modules/meeting-domain';

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

export const classifyMeetingOutputSchema = z
  .object({
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .refine((value) => !/[\r\n]/u.test(value)),
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

export type MeetingAIErrorCode =
  | 'INPUT_INVALID'
  | 'ORIGIN_INVALID'
  | 'OUTPUT_INVALID'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_CONFIG_INVALID'
  | 'PROVIDER_CONFIG_UNAVAILABLE'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'REQUEST_CANCELLED';

export const meetingAIErrorCodeSchema = z.enum([
  'INPUT_INVALID',
  'ORIGIN_INVALID',
  'OUTPUT_INVALID',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_CONFIG_INVALID',
  'PROVIDER_CONFIG_UNAVAILABLE',
  'PROVIDER_MODEL_NOT_FOUND',
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'REQUEST_CANCELLED',
] satisfies MeetingAIErrorCode[]);

export function meetingAIApiResponseSchema<ValueSchema extends z.ZodType>(value: ValueSchema) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }).strict(),
    z
      .object({
        error: z.object({ code: meetingAIErrorCodeSchema }).strict(),
        ok: z.literal(false),
      })
      .strict(),
  ]);
}

export type MeetingAIApiResponse<Value> =
  { ok: true; value: Value } | { error: { code: MeetingAIErrorCode }; ok: false };
