import {
  answerGrillTurn,
  completeGrill,
  nextGrillPhase,
  restartPreparation,
  resumeGrill,
  type GrillPhase,
  type GrillTurn,
  type GrillTurnDisposition,
  type Meeting,
  type MeetingBriefSnapshot,
} from '@/modules/meeting-domain';
import type { MeetingAggregate } from '@/modules/meeting-db/read';
import { MeetingRepository } from '@/modules/meeting-db/repository';

import {
  createEmptyKnownState,
  grillInputSchema,
  toMeetingBriefDraft,
  type GrillInput,
  type PreparationAIClient,
} from './ai-contract';
import { requestValidInitialMap } from './initial-map';

export class PreparationFlowError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PreparationFlowError';
  }
}

interface FlowDependencies {
  client: PreparationAIClient;
  createId?: () => string;
  now?: () => Date;
  repository: MeetingRepository;
}

interface GrillStepOptions {
  finishRequested?: true;
  intent?: 'CONTINUE_DEFAULT' | 'CONTINUE_USER';
  requestedDimension?: string;
  signal?: AbortSignal;
}

function completedTurns(turns: readonly GrillTurn[]): GrillTurn[] {
  return turns.filter(({ disposition }) => disposition !== 'PENDING');
}

export function buildGrillInput(
  meeting: Meeting,
  turns: readonly GrillTurn[],
  phase: GrillPhase,
  options: Pick<GrillStepOptions, 'finishRequested' | 'requestedDimension'> = {},
): GrillInput {
  if (meeting.mode === undefined) throw new PreparationFlowError('INVALID_MEETING_STATE');
  const completed = completedTurns(turns);
  return grillInputSchema.parse({
    finishRequested: options.finishRequested,
    history: completed.map(({ answer, disposition, question }) => ({
      answer,
      disposition,
      question,
    })),
    knownState: completed.at(-1)?.knownState ?? createEmptyKnownState(),
    mode: meeting.mode,
    phase,
    rawRequest: meeting.rawRequest,
    requestedDimension: options.requestedDimension,
    turnIndex: completed.length,
  });
}

function requireSuccess<T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string } },
): T {
  if (!result.ok) throw new PreparationFlowError(result.error.code);
  return result.value;
}

export async function runGrillStep(
  aggregate: MeetingAggregate,
  dependencies: FlowDependencies,
  options: GrillStepOptions = {},
): Promise<
  { kind: 'BRIEF'; meeting: Meeting } | { kind: 'QUESTION'; meeting: Meeting; turn: GrillTurn }
> {
  if (
    aggregate.meeting.status !== 'PREPARING' ||
    aggregate.meeting.preparationStage !== 'GRILLING' ||
    aggregate.grillTurns.some(({ disposition }) => disposition === 'PENDING')
  ) {
    throw new PreparationFlowError('INVALID_MEETING_STATE');
  }
  const completed = completedTurns(aggregate.grillTurns);
  let phase: GrillPhase;
  if (options.finishRequested) {
    phase = completed.length <= 5 ? 'DEFAULT' : 'USER_EXTENDED';
  } else {
    phase = requireSuccess(nextGrillPhase(completed, options.intent ?? 'CONTINUE_DEFAULT'));
  }
  const input = buildGrillInput(aggregate.meeting, completed, phase, options);
  const output = await dependencies.client.grill(
    input,
    aggregate.meeting.contentLocale,
    options.signal,
  );
  const now = (dependencies.now ?? (() => new Date()))();
  if (!output.shouldAsk) {
    const transition = requireSuccess(
      completeGrill(aggregate.meeting, toMeetingBriefDraft(output), now),
    );
    return {
      kind: 'BRIEF',
      meeting: requireSuccess(
        await dependencies.repository.savePreparationTransition(
          transition,
          aggregate.meeting.updatedAt,
        ),
      ),
    };
  }
  const turn: GrillTurn = {
    criticalExtraReason: output.criticalExtraReason,
    createdAt: now.toISOString(),
    disposition: 'PENDING',
    id: dependencies.createId?.() ?? crypto.randomUUID(),
    index: input.turnIndex,
    knownState: structuredClone(output.updatedState),
    meetingId: aggregate.meeting.id,
    phase,
    question: output.question!,
    readiness: structuredClone(output.readiness),
    reason: output.reason,
  };
  const write = requireSuccess(
    await dependencies.repository.putGrillTurn(turn, aggregate.meeting.updatedAt, now),
  );
  return { kind: 'QUESTION', meeting: write.meeting, turn: write.turn };
}

export async function answerCurrentGrillTurn(
  meeting: Meeting,
  turn: GrillTurn,
  disposition: GrillTurnDisposition,
  answer: string | undefined,
  dependencies: Pick<FlowDependencies, 'now' | 'repository'>,
): Promise<{ meeting: Meeting; turn: GrillTurn }> {
  if (meeting.mode === undefined) throw new PreparationFlowError('INVALID_MEETING_STATE');
  const completed = requireSuccess(answerGrillTurn(turn, meeting.mode, disposition, answer));
  return requireSuccess(
    await dependencies.repository.putGrillTurn(
      completed,
      meeting.updatedAt,
      (dependencies.now ?? (() => new Date()))(),
    ),
  );
}

export async function lockBriefAndGenerateMap(
  aggregate: MeetingAggregate,
  dependencies: FlowDependencies,
  signal?: AbortSignal,
): Promise<void> {
  const { meeting } = aggregate;
  if (
    meeting.status !== 'PREPARING' ||
    meeting.preparationStage !== 'BRIEF_READY' ||
    meeting.mode === undefined ||
    meeting.brief === undefined
  ) {
    throw new PreparationFlowError('INVALID_MEETING_STATE');
  }
  const now = (dependencies.now ?? (() => new Date()))();
  const snapshot: MeetingBriefSnapshot =
    meeting.brief.confirmedAt === undefined
      ? { ...structuredClone(meeting.brief), confirmedAt: now.toISOString() }
      : structuredClone(meeting.brief as MeetingBriefSnapshot);
  const graph = await requestValidInitialMap(
    dependencies.client,
    { brief: snapshot, mode: meeting.mode },
    meeting.id,
    meeting.contentLocale,
    { createId: dependencies.createId, now, signal },
  );
  requireSuccess(await dependencies.repository.saveInitialGraph(graph, meeting.updatedAt, now));
}

export async function returnToGrill(
  meeting: Meeting,
  repository: MeetingRepository,
  now = new Date(),
): Promise<Meeting> {
  return requireSuccess(
    await repository.savePreparationTransition(
      requireSuccess(resumeGrill(meeting, now)),
      meeting.updatedAt,
    ),
  );
}

export async function returnToModeSelection(
  meeting: Meeting,
  repository: MeetingRepository,
  now = new Date(),
): Promise<Meeting> {
  return requireSuccess(
    await repository.savePreparationTransition(
      requireSuccess(restartPreparation(meeting, now)),
      meeting.updatedAt,
    ),
  );
}
