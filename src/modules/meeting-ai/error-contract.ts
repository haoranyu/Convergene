import { z } from 'zod';

import { providerOutputFailureSchema } from './provider-output-failure';

export const meetingAIErrorCodes = [
  'INPUT_INVALID',
  'ORIGIN_INVALID',
  'OUTPUT_INVALID',
  'OUTPUT_LANGUAGE_MISMATCH',
  'PROVIDER_ACCESS_RESTRICTED',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_CONFIG_INVALID',
  'PROVIDER_CONFIG_UNAVAILABLE',
  'PROVIDER_MODEL_NOT_FOUND',
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'REQUEST_CANCELLED',
  'UNKNOWN',
] as const;

export type MeetingAIErrorCode = (typeof meetingAIErrorCodes)[number];

const meetingAINonOutputErrorCodes = meetingAIErrorCodes.filter(
  (code): code is Exclude<MeetingAIErrorCode, 'OUTPUT_INVALID'> => code !== 'OUTPUT_INVALID',
) as [
  Exclude<MeetingAIErrorCode, 'OUTPUT_INVALID'>,
  ...Exclude<MeetingAIErrorCode, 'OUTPUT_INVALID'>[],
];

export const meetingAIErrorCodeSchema = z.enum(meetingAIErrorCodes);

export const meetingAIErrorSchema = z.discriminatedUnion('code', [
  z
    .object({
      code: z.literal('OUTPUT_INVALID'),
      outputFailure: providerOutputFailureSchema.optional(),
    })
    .strip(),
  z.object({ code: z.enum(meetingAINonOutputErrorCodes) }).strip(),
]);

export const meetingAIErrorResponseSchema = z
  .object({
    error: meetingAIErrorSchema,
    ok: z.literal(false),
  })
  .strip();

export type MeetingAIError = z.infer<typeof meetingAIErrorSchema>;

export type MeetingAIResult<Value> =
  { ok: true; value: Value } | { error: MeetingAIError; ok: false };
