import { z } from 'zod';

import {
  grillQuestionTypes,
  meetingModes,
  modeReadinessDimensionKeys,
  readinessLevels,
  sharedReadinessDimensionKeys,
  supportedLocales,
  type GrillKnownState,
  type GrillPhase,
  type MeetingBriefDraft,
  type MeetingMode,
  type ReadinessDimension,
  type SupportedLocale,
} from '@/modules/meeting-domain';
import {
  graphemeCount,
  maximumNodeTitleGraphemes,
  nodeKinds,
  type NodeKind,
} from '@/modules/mind-map-domain';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const boundedList = (maximumItems: number, maximumLength: number) =>
  z.array(boundedText(maximumLength)).max(maximumItems);
const nodeTitleText = z
  .string()
  .trim()
  .min(1)
  .refine((value) => graphemeCount(value) <= maximumNodeTitleGraphemes, {
    message: `title must contain at most ${maximumNodeTitleGraphemes} graphemes`,
  });

export const grillTask = 'grill' as const;
export const initialMapTask = 'initial-map' as const;
export const grillMaximumRequestBodyBytes = 393_216;
export const initialMapMaximumRequestBodyBytes = 262_144;

export const grillHistoryDispositionSchema = z.enum(['ANSWERED', 'UNKNOWN', 'SKIPPED']);
export const grillPhaseSchema = z.enum(['DEFAULT', 'CRITICAL_EXTRA', 'USER_EXTENDED']);
export const grillQuestionTypeSchema = z.enum(grillQuestionTypes);

const grillQuestionOptionValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const grillQuestionOptionSchema = z
  .object({
    label: boundedText(240),
    value: grillQuestionOptionValueSchema,
  })
  .strict();

export const grillQuestionOptionsSchema = z
  .array(grillQuestionOptionSchema)
  .min(2)
  .max(6)
  .superRefine((options, context) => {
    if (new Set(options.map(({ label }) => label)).size !== options.length) {
      context.addIssue({ code: 'custom', message: 'question option labels must be unique' });
    }
    if (new Set(options.map(({ value }) => value)).size !== options.length) {
      context.addIssue({ code: 'custom', message: 'question option values must be unique' });
    }
  });

export const grillKnownStateSchema = z
  .object({
    assumptions: boundedList(30, 500),
    confirmed: boundedList(30, 500),
    unknowns: boundedList(30, 500),
  })
  .strict();

const readinessDimensionSchema = z
  .object({
    key: boundedText(80),
    status: z.enum(['MISSING', 'PARTIAL', 'READY']),
    summary: z.string().trim().max(500).optional(),
  })
  .strict();

export const readinessSchema = z
  .object({
    dimensions: z.array(readinessDimensionSchema).min(6).max(10),
    level: z.enum(readinessLevels),
  })
  .strict();

export const meetingBriefSnapshotSchema = z
  .object({
    assumptions: boundedList(30, 500),
    confirmed: boundedList(30, 500),
    confirmedAt: z.iso.datetime({ offset: true }),
    desiredOutcome: boundedText(2_000),
    facilitation: z
      .object({
        closingChecklist: boundedList(12, 300),
        openingLine: boundedText(600),
      })
      .strict(),
    objective: boundedText(2_000),
    readiness: readinessSchema,
    unknowns: boundedList(30, 500),
  })
  .strict();

const grillHistoryItemSchema = z
  .object({
    answer: z.string().trim().min(1).max(4_000).optional(),
    disposition: grillHistoryDispositionSchema,
    options: grillQuestionOptionsSchema.optional(),
    question: boundedText(600),
    questionType: grillQuestionTypeSchema.optional(),
  })
  .strict()
  .superRefine((item, context) => {
    if ((item.disposition === 'ANSWERED') !== (item.answer !== undefined)) {
      context.addIssue({ code: 'custom', message: 'ANSWERED must include one answer' });
    }
    if (item.questionType === 'SINGLE_CHOICE' && item.options === undefined) {
      context.addIssue({ code: 'custom', message: 'single-choice history must include options' });
    }
    if (item.questionType === 'FREE_TEXT' && item.options !== undefined) {
      context.addIssue({ code: 'custom', message: 'free-text history cannot include options' });
    }
  });

export const grillInputSchema = z
  .object({
    finishRequested: z.literal(true).optional(),
    history: z.array(grillHistoryItemSchema).max(10),
    knownState: grillKnownStateSchema,
    mode: z.enum(meetingModes),
    phase: grillPhaseSchema,
    rawRequest: z
      .string()
      .refine((value) => value.trim() !== '')
      .max(4_000),
    requestedDimension: boundedText(80).optional(),
    turnIndex: z.number().int().min(0).max(10),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.history.length !== input.turnIndex) {
      context.addIssue({
        code: 'custom',
        message: 'turnIndex must equal completed history length',
      });
    }
    if (!input.finishRequested && input.turnIndex >= 10) {
      context.addIssue({ code: 'custom', message: 'the eleventh question is not allowed' });
    }
    if (
      !input.finishRequested &&
      ((input.phase === 'DEFAULT' && input.turnIndex > 4) ||
        (input.phase === 'CRITICAL_EXTRA' && input.turnIndex !== 5) ||
        (input.phase === 'USER_EXTENDED' && input.turnIndex < 5))
    ) {
      context.addIssue({ code: 'custom', message: 'phase does not match turnIndex' });
    }
  });

const suggestedBriefSchema = z
  .object({
    assumptions: boundedList(30, 500),
    confirmed: boundedList(30, 500),
    desiredOutcome: boundedText(2_000),
    facilitation: z
      .object({
        closingChecklist: boundedList(12, 300),
        openingLine: boundedText(600),
      })
      .strict(),
    objective: boundedText(2_000),
    unknowns: boundedList(30, 500),
  })
  .strict();

export const grillOutputSchema = z
  .object({
    criticalExtraReason: z.string().trim().min(1).max(600).optional(),
    options: grillQuestionOptionsSchema.optional(),
    question: z.string().trim().min(1).max(600).optional(),
    questionType: grillQuestionTypeSchema.optional(),
    readiness: readinessSchema,
    reason: z.string().trim().min(1).max(600).optional(),
    shouldAsk: z.boolean(),
    suggestedBrief: suggestedBriefSchema.optional(),
    updatedState: grillKnownStateSchema,
  })
  .strict()
  .superRefine((output, context) => {
    if (output.shouldAsk) {
      if (output.question === undefined || output.reason === undefined) {
        context.addIssue({ code: 'custom', message: 'a question must include its reason' });
      }
      if (output.questionType === undefined) {
        context.addIssue({ code: 'custom', message: 'a question must include its type' });
      } else if (output.questionType === 'SINGLE_CHOICE' && output.options === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'single-choice question must include options',
        });
      } else if (output.questionType === 'FREE_TEXT' && output.options !== undefined) {
        context.addIssue({ code: 'custom', message: 'free-text question cannot include options' });
      }
      if (output.suggestedBrief !== undefined) {
        context.addIssue({ code: 'custom', message: 'asking output cannot include a Brief' });
      }
      return;
    }
    if (output.suggestedBrief === undefined) {
      context.addIssue({ code: 'custom', message: 'completed Grill must include a Brief' });
    }
    if (output.question !== undefined || output.reason !== undefined) {
      context.addIssue({ code: 'custom', message: 'completed Grill cannot include a question' });
    }
    if (output.questionType !== undefined || output.options !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'completed Grill cannot include question controls',
      });
    }
  });

const providerReadinessDimensionSchema = z
  .object({
    key: boundedText(80),
    status: z.enum(['MISSING', 'PARTIAL', 'READY']),
    summary: z.string().trim().max(500).nullish(),
  })
  .strict();

const providerReadinessSchema = z
  .object({
    dimensions: z.array(providerReadinessDimensionSchema).min(6).max(10),
    level: z.enum(readinessLevels),
  })
  .strict();

export const providerGrillOutputSchema = z
  .object({
    criticalExtraReason: z.string().trim().min(1).max(600).nullish(),
    options: grillQuestionOptionsSchema.nullish(),
    question: z.string().trim().min(1).max(600).nullish(),
    questionType: grillQuestionTypeSchema.nullish(),
    readiness: providerReadinessSchema,
    reason: z.string().trim().min(1).max(600).nullish(),
    shouldAsk: z.boolean(),
    suggestedBrief: suggestedBriefSchema.nullish(),
    updatedState: grillKnownStateSchema,
  })
  .strict();

export function parseProviderGrillOutput(value: unknown): GrillOutput {
  const output = providerGrillOutputSchema.parse(value);
  return grillOutputSchema.parse({
    ...(output.criticalExtraReason == null
      ? {}
      : { criticalExtraReason: output.criticalExtraReason }),
    ...(output.options == null ? {} : { options: output.options }),
    ...(output.question == null ? {} : { question: output.question }),
    ...(output.questionType == null ? {} : { questionType: output.questionType }),
    readiness: {
      dimensions: output.readiness.dimensions.map(({ key, status, summary }) => ({
        key,
        status,
        ...(summary == null ? {} : { summary }),
      })),
      level: output.readiness.level,
    },
    ...(output.reason == null ? {} : { reason: output.reason }),
    shouldAsk: output.shouldAsk,
    ...(output.suggestedBrief == null ? {} : { suggestedBrief: output.suggestedBrief }),
    updatedState: output.updatedState,
  });
}

export type GrillInput = z.infer<typeof grillInputSchema>;
export type GrillOutput = z.infer<typeof grillOutputSchema>;

export function validReadinessForMode(
  mode: MeetingMode,
  dimensions: readonly ReadinessDimension[],
): boolean {
  const keys = dimensions.map(({ key }) => key);
  if (new Set(keys).size !== keys.length) return false;
  const expected = new Set<string>([
    ...sharedReadinessDimensionKeys,
    ...modeReadinessDimensionKeys[mode],
  ]);
  if (mode === 'GENERAL') {
    return (
      sharedReadinessDimensionKeys.every((key) => keys.includes(key)) &&
      keys.filter((key) => !expected.has(key)).length <= 2
    );
  }
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

export function parseGrillOutput(input: GrillInput, value: unknown): GrillOutput {
  const output = grillOutputSchema.parse(value);
  if (!validReadinessForMode(input.mode, output.readiness.dimensions)) {
    throw new z.ZodError([
      { code: 'custom', message: 'readiness dimensions are invalid for the mode', path: [] },
    ]);
  }
  if (input.finishRequested && output.shouldAsk) {
    throw new z.ZodError([
      { code: 'custom', message: 'finishRequested cannot return another question', path: [] },
    ]);
  }
  if (
    output.shouldAsk &&
    (input.phase === 'CRITICAL_EXTRA') !== (output.criticalExtraReason !== undefined)
  ) {
    throw new z.ZodError([
      { code: 'custom', message: 'only the critical extra question needs its reason', path: [] },
    ]);
  }
  if (!output.shouldAsk && output.criticalExtraReason !== undefined) {
    throw new z.ZodError([
      { code: 'custom', message: 'completed Grill cannot include a critical reason', path: [] },
    ]);
  }
  return output;
}

export function toMeetingBriefDraft(output: GrillOutput): MeetingBriefDraft {
  if (output.suggestedBrief === undefined) {
    throw new Error('Grill output does not contain a Brief');
  }
  return {
    ...output.suggestedBrief,
    assumptions: [...output.suggestedBrief.assumptions],
    confirmed: [...output.suggestedBrief.confirmed],
    facilitation: {
      ...output.suggestedBrief.facilitation,
      closingChecklist: [...output.suggestedBrief.facilitation.closingChecklist],
    },
    readiness: {
      dimensions: output.readiness.dimensions.map((dimension) => ({ ...dimension })),
      level: output.readiness.level,
    },
    unknowns: [...output.suggestedBrief.unknowns],
  };
}

export const initialMapNodeDraftSchema = z
  .object({
    key: boundedText(80),
    kind: z.enum(nodeKinds),
    note: z.string().trim().max(2_000).optional(),
    order: z.number().int().min(0).max(4).optional(),
    parentKey: boundedText(80).optional(),
    title: nodeTitleText,
    topicPrompt: z.string().trim().min(1).max(600).optional(),
    transitionHint: z.string().trim().min(1).max(600).optional(),
  })
  .strict();

export const initialMapOutputSchema = z
  .object({
    nodes: z.array(initialMapNodeDraftSchema).min(4).max(12),
    templateCoverage: boundedList(12, 120).min(1),
  })
  .strict();

const providerInitialMapObjectiveSchema = z
  .object({
    note: z.string().trim().max(2_000).nullish(),
    title: nodeTitleText,
  })
  .strict();

const providerInitialMapTopicSchema = z
  .object({
    note: z.string().trim().max(2_000).nullish(),
    title: nodeTitleText,
    topicPrompt: boundedText(600),
    transitionHint: boundedText(600),
  })
  .strict();

export const providerInitialMapOutputSchema = z
  .object({
    objective: providerInitialMapObjectiveSchema,
    templateCoverage: boundedList(12, 120).min(1),
    topics: z.array(providerInitialMapTopicSchema).min(3).max(5),
  })
  .strict();

export function parseProviderInitialMapOutput(value: unknown): InitialMapOutput {
  const output = providerInitialMapOutputSchema.parse(value);
  return initialMapOutputSchema.parse({
    nodes: [
      {
        key: 'objective',
        kind: 'OBJECTIVE',
        ...(output.objective.note == null ? {} : { note: output.objective.note }),
        title: output.objective.title,
      },
      ...output.topics.map(({ note, title, topicPrompt, transitionHint }, order) => ({
        key: `topic-${order + 1}`,
        kind: 'TOPIC' as const,
        ...(note == null ? {} : { note }),
        order,
        parentKey: 'objective',
        title,
        topicPrompt,
        transitionHint,
      })),
    ],
    templateCoverage: output.templateCoverage,
  });
}

export type ProviderInitialMapOutput = z.infer<typeof providerInitialMapOutputSchema>;

export const initialMapInputSchema = z
  .object({
    brief: meetingBriefSnapshotSchema,
    mode: z.enum(meetingModes),
  })
  .strict()
  .superRefine((input, context) => {
    if (!validReadinessForMode(input.mode, input.brief.readiness.dimensions)) {
      context.addIssue({
        code: 'custom',
        message: 'Brief readiness dimensions are invalid for the mode',
        path: ['brief', 'readiness', 'dimensions'],
      });
    }
  });

export type InitialMapInput = z.infer<typeof initialMapInputSchema>;
export type InitialMapNodeDraft = z.infer<typeof initialMapNodeDraftSchema> & {
  kind: NodeKind;
};
export type InitialMapOutput = z.infer<typeof initialMapOutputSchema>;

export interface AIRequest<TInput> {
  input: TInput;
  outputLocale: SupportedLocale;
  requestId: string;
  task: typeof grillTask | typeof initialMapTask;
}

export interface AIResponse<TOutput> {
  output: TOutput;
  requestId: string;
  task: typeof grillTask | typeof initialMapTask;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export const grillRequestSchema = z
  .object({
    input: grillInputSchema,
    outputLocale: z.enum(supportedLocales),
    requestId: z.uuid(),
    task: z.literal(grillTask),
  })
  .strict();

export const initialMapRequestSchema = z
  .object({
    input: initialMapInputSchema,
    outputLocale: z.enum(supportedLocales),
    requestId: z.uuid(),
    task: z.literal(initialMapTask),
  })
  .strict();

export const grillResponseSchema = z
  .object({
    output: grillOutputSchema,
    requestId: z.uuid(),
    task: z.literal(grillTask),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const initialMapResponseSchema = z
  .object({
    output: initialMapOutputSchema,
    requestId: z.uuid(),
    task: z.literal(initialMapTask),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const preparationAIErrorCodes = [
  'ORIGIN_INVALID',
  'RATE_LIMITED',
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_ACCESS_RESTRICTED',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_CONFIG_INVALID',
  'PROVIDER_CONFIG_UNAVAILABLE',
  'PROVIDER_MODEL_NOT_FOUND',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INPUT_INVALID',
  'OUTPUT_INVALID',
  'OUTPUT_LANGUAGE_MISMATCH',
  'REQUEST_CANCELLED',
  'UNKNOWN',
] as const;

export type PreparationAIErrorCode = (typeof preparationAIErrorCodes)[number];

export interface PreparationAIClient {
  grill(
    input: GrillInput,
    outputLocale: SupportedLocale,
    signal?: AbortSignal,
  ): Promise<GrillOutput>;
  initialMap(
    input: InitialMapInput,
    outputLocale: SupportedLocale,
    signal?: AbortSignal,
  ): Promise<InitialMapOutput>;
}

export function createEmptyKnownState(): GrillKnownState {
  return { assumptions: [], confirmed: [], unknowns: [] };
}

export function phaseForTurnIndex(index: number, phase: GrillPhase): GrillPhase {
  return grillPhaseSchema.parse(phaseForIndex(index, phase));
}

function phaseForIndex(index: number, phase: GrillPhase): GrillPhase {
  if (phase === 'DEFAULT' && index <= 4) return phase;
  if (phase === 'CRITICAL_EXTRA' && index === 5) return phase;
  if (phase === 'USER_EXTENDED' && index >= 5 && index <= 9) return phase;
  throw new Error('Grill phase is outside its allowed turn range');
}

export const supportedOutputLocales = z.enum(supportedLocales);
