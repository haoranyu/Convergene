import type { Result } from '@/modules/shared';

import { outcomeKinds } from './model';
import type { Meeting, MeetingDomainErrorCode, MeetingOutcome, OutcomeKind } from './model';

export interface MarkOutcomeInput {
  id: string;
  nodeId: string;
  kind: OutcomeKind;
  owner?: string;
  dueDate?: string;
  note?: string;
}

function failure(code: MeetingDomainErrorCode): Result<never, MeetingDomainErrorCode> {
  return { error: { code }, ok: false };
}

export function markOutcome(
  meeting: Meeting,
  existingOutcomes: readonly MeetingOutcome[],
  input: MarkOutcomeInput,
  now: Date,
): Result<MeetingOutcome, MeetingDomainErrorCode> {
  if (meeting.status === 'PREPARING') {
    return failure('INVALID_MEETING_STATE');
  }

  if (existingOutcomes.some((outcome) => outcome.meetingId !== meeting.id)) {
    return failure('INVALID_OUTCOME');
  }

  if (
    existingOutcomes.some((outcome) => outcome.nodeId === input.nodeId || outcome.id === input.id)
  ) {
    return failure('OUTCOME_ALREADY_EXISTS');
  }

  if (
    typeof input.id !== 'string' ||
    input.id.trim() === '' ||
    typeof input.nodeId !== 'string' ||
    input.nodeId.trim() === '' ||
    !outcomeKinds.includes(input.kind) ||
    (input.owner !== undefined && typeof input.owner !== 'string') ||
    (input.dueDate !== undefined && typeof input.dueDate !== 'string') ||
    (input.note !== undefined && typeof input.note !== 'string') ||
    (input.kind !== 'ACTION' && (input.owner !== undefined || input.dueDate !== undefined))
  ) {
    return failure('INVALID_OUTCOME');
  }

  if (!Number.isFinite(now.getTime())) {
    return failure('INVALID_TIME_RANGE');
  }

  if (meeting.status === 'LIVE') {
    const startedAt = meeting.startedAt ? Date.parse(meeting.startedAt) : Number.NaN;

    if (!Number.isFinite(startedAt) || now.getTime() < startedAt) {
      return failure('INVALID_TIME_RANGE');
    }
  }

  return {
    ok: true,
    value: {
      dueDate: input.dueDate,
      id: input.id,
      kind: input.kind,
      meetingId: meeting.id,
      nodeId: input.nodeId,
      note: input.note,
      origin: meeting.status === 'LIVE' ? 'LIVE' : 'POST_MEETING',
      owner: input.owner,
      markedAt: meeting.status === 'LIVE' ? now.toISOString() : undefined,
    },
  };
}

export function unmarkOutcome(
  outcomes: readonly MeetingOutcome[],
  outcomeId: string,
): Result<MeetingOutcome[], MeetingDomainErrorCode> {
  if (!outcomes.some((outcome) => outcome.id === outcomeId)) {
    return failure('INVALID_OUTCOME');
  }

  return { ok: true, value: outcomes.filter((outcome) => outcome.id !== outcomeId) };
}
