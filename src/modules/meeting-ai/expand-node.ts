import { z } from 'zod';

import { meetingModes, supportedLocales, type MeetingMode } from '@/modules/meeting-domain';
import { nodeKinds, strategyIds, type NodeKind, type StrategyId } from '@/modules/mind-map-domain';

export {
  meetingAIErrorCodeSchema,
  meetingAIErrorCodes,
  meetingAIErrorResponseSchema,
  type MeetingAIError,
  type MeetingAIErrorCode,
  type MeetingAIResult,
} from './error-contract';

export const expandNodeTask = 'expand-node' as const;
export const expandNodeMaximumRequestBodyBytes = 32_768;

export type { ProviderOutputFailure } from './provider-output-failure';

export const strategyIdsForMode = {
  BRAINSTORM: ['BRAINSTORM_GO_WILDER', 'BRAINSTORM_CHANGE_LENS', 'BRAINSTORM_CONVERGE'],
  DECISION: ['DECISION_ADD_OPTION', 'DECISION_SURFACE_RISK', 'DECISION_DRIVE_CHOICE'],
  GENERAL: ['GENERAL_DIVERGE', 'GENERAL_DECOMPOSE', 'GENERAL_CHALLENGE'],
  RETRO: ['RETRO_FIND_CAUSE', 'RETRO_FIND_COUNTEREXAMPLE', 'RETRO_TURN_INTO_ACTION'],
} as const satisfies Record<MeetingMode, readonly [StrategyId, StrategyId, StrategyId]>;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function withinGraphemeLimit(value: string, maximum: number): boolean {
  return [...graphemeSegmenter.segment(value.trim())].length <= maximum;
}

export const expandNodeContextSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    kind: z.enum(nodeKinds),
    note: z.string().trim().min(1).max(320).optional(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(192)
      .refine((value) => withinGraphemeLimit(value, 48)),
  })
  .strict();

export const expandNodeInputSchema = z
  .object({
    briefSummary: z.string().trim().min(1).max(2_400),
    children: z.array(expandNodeContextSchema).max(8),
    mode: z.enum(meetingModes),
    parent: expandNodeContextSchema.optional(),
    selectedNode: expandNodeContextSchema,
    siblings: z.array(expandNodeContextSchema).max(8),
    strategyId: z.enum(strategyIds),
  })
  .strict()
  .superRefine((value, context) => {
    if (!(strategyIdsForMode[value.mode] as readonly StrategyId[]).includes(value.strategyId)) {
      context.addIssue({
        code: 'custom',
        message: 'Strategy does not belong to the meeting mode',
        path: ['strategyId'],
      });
    }
  });

export const expandNodeRequestSchema = z
  .object({
    input: expandNodeInputSchema,
    outputLocale: z.enum(supportedLocales),
    requestId: z.uuid(),
    task: z.literal(expandNodeTask),
  })
  .strict();

const expansionNodeKinds = nodeKinds.filter(
  (kind): kind is Exclude<NodeKind, 'OBJECTIVE' | 'TOPIC'> =>
    kind !== 'OBJECTIVE' && kind !== 'TOPIC',
);

export const expandNodeChildSchema = z
  .object({
    kind: z.enum(expansionNodeKinds),
    note: z.string().trim().min(1).max(1_000).optional(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(192)
      .refine((value) => withinGraphemeLimit(value, 48))
      .meta({ maxLength: 48 }),
  })
  .strict();

export const expandNodeOutputSchema = z
  .object({ children: z.array(expandNodeChildSchema).min(2).max(4) })
  .strict();

const expandNodeProviderChildSchema = z
  .object({
    kind: z.enum(expansionNodeKinds),
    title: expandNodeChildSchema.shape.title,
  })
  .strict();

export const expandNodeProviderOutputSchema = z
  .object({ children: z.array(expandNodeProviderChildSchema).length(2) })
  .strict();

export const expandNodeResponseSchema = z
  .object({
    output: expandNodeOutputSchema,
    requestId: z.uuid(),
    task: z.literal(expandNodeTask),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ExpandNodeContext = z.infer<typeof expandNodeContextSchema>;
export type ExpandNodeInput = z.infer<typeof expandNodeInputSchema>;
export type ExpandNodeChild = z.infer<typeof expandNodeChildSchema>;
export type ExpandNodeOutput = z.infer<typeof expandNodeOutputSchema>;
export type ExpandNodeRequest = z.infer<typeof expandNodeRequestSchema>;
export type ExpandNodeResponse = z.infer<typeof expandNodeResponseSchema>;

const simplifiedOnlyPattern = /[这为发会选从与后个们现该让时问产实将开达过进还边]/gu;
const traditionalOnlyPattern = /[這為發會選從與後個們現該讓時問產實將開達過進還邊]/gu;

function matchCount(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

export function expandNodeOutputMatchesLocale(
  output: ExpandNodeOutput,
  outputLocale: (typeof supportedLocales)[number],
): boolean {
  const generatedText = output.children
    .flatMap((child) => [child.title, child.note ?? ''])
    .join(' ');
  const hanCount = matchCount(generatedText, /\p{Script=Han}/gu);
  const latinCount = matchCount(generatedText, /\p{Script=Latin}/gu);
  if (outputLocale === 'en-US') return hanCount < 2 || latinCount >= 8;
  if (hanCount === 0 && latinCount >= 2) return false;
  const simplifiedCount = matchCount(generatedText, simplifiedOnlyPattern);
  const traditionalCount = matchCount(generatedText, traditionalOnlyPattern);
  return outputLocale === 'zh-TW'
    ? simplifiedCount < 2 || traditionalCount > 0
    : traditionalCount < 2 || simplifiedCount > 0;
}
