import type { Result } from '@/modules/shared';

import type {
  Meeting,
  MeetingBriefDraft,
  MeetingBriefSnapshot,
  MeetingDomainErrorCode,
  MeetingMode,
} from './model';
import { validateGrillTurn } from './grill';

function failure(code: MeetingDomainErrorCode): Result<never, MeetingDomainErrorCode> {
  return { error: { code }, ok: false };
}

function updated(meeting: Meeting, now: Date): Meeting {
  return { ...meeting, updatedAt: now.toISOString() };
}

function validNow(now: Date): boolean {
  return Number.isFinite(now.getTime());
}

function nonEmptyStrings(values: readonly string[]): boolean {
  return values.every((value) => typeof value === 'string' && value.trim() !== '');
}

export function validateMeetingBriefDraft(
  brief: MeetingBriefDraft,
  mode: MeetingMode,
): Result<MeetingBriefDraft, MeetingDomainErrorCode> {
  const probeTurn = {
    createdAt: '2000-01-01T00:00:00.000Z',
    disposition: 'PENDING' as const,
    id: 'brief-readiness-probe',
    index: 0,
    knownState: { assumptions: [], confirmed: [], unknowns: [] },
    meetingId: 'brief-readiness-probe',
    phase: 'DEFAULT' as const,
    question: 'Readiness validation probe',
    readiness: brief.readiness,
  };
  if (
    brief.objective.trim() === '' ||
    brief.desiredOutcome.trim() === '' ||
    brief.facilitation.openingLine.trim() === '' ||
    !nonEmptyStrings(brief.confirmed) ||
    !nonEmptyStrings(brief.assumptions) ||
    !nonEmptyStrings(brief.unknowns) ||
    !nonEmptyStrings(brief.facilitation.closingChecklist) ||
    !validateGrillTurn(probeTurn, mode).ok
  ) {
    return failure('INVALID_BRIEF');
  }
  return { ok: true, value: brief };
}

export function confirmMeetingMode(
  meeting: Meeting,
  mode: MeetingMode,
  reason: string | undefined,
  now: Date,
): Result<Meeting, MeetingDomainErrorCode> {
  if (!validNow(now)) return failure('INVALID_TIME_RANGE');
  if (meeting.status !== 'PREPARING' || meeting.preparationStage !== 'DRAFT') {
    return failure('INVALID_MEETING_STATE');
  }

  return {
    ok: true,
    value: updated(
      {
        ...meeting,
        brief: undefined,
        mode,
        modeReason: reason,
        preparationStage: 'GRILLING',
      },
      now,
    ),
  };
}

export function completeGrill(
  meeting: Meeting,
  brief: MeetingBriefDraft,
  now: Date,
): Result<Meeting, MeetingDomainErrorCode> {
  if (!validNow(now)) return failure('INVALID_TIME_RANGE');
  if (
    meeting.status !== 'PREPARING' ||
    meeting.preparationStage !== 'GRILLING' ||
    meeting.mode === undefined
  ) {
    return failure('INVALID_MEETING_STATE');
  }

  const validation = validateMeetingBriefDraft(brief, meeting.mode);
  if (!validation.ok) return validation;

  return {
    ok: true,
    value: updated({ ...meeting, brief, preparationStage: 'BRIEF_READY' }, now),
  };
}

export function updateBriefDraft(
  meeting: Meeting,
  brief: MeetingBriefDraft,
  now: Date,
): Result<Meeting, MeetingDomainErrorCode> {
  if (!validNow(now)) return failure('INVALID_TIME_RANGE');
  if (
    meeting.status !== 'PREPARING' ||
    meeting.preparationStage !== 'BRIEF_READY' ||
    meeting.mode === undefined ||
    meeting.brief?.confirmedAt !== undefined
  ) {
    return failure('INVALID_MEETING_STATE');
  }
  const validation = validateMeetingBriefDraft(brief, meeting.mode);
  if (!validation.ok) return validation;
  return { ok: true, value: updated({ ...meeting, brief }, now) };
}

export function confirmBrief(meeting: Meeting, now: Date): Result<Meeting, MeetingDomainErrorCode> {
  if (!validNow(now)) return failure('INVALID_TIME_RANGE');
  if (meeting.status !== 'PREPARING' || meeting.preparationStage !== 'BRIEF_READY') {
    return failure('INVALID_MEETING_STATE');
  }

  if (meeting.brief === undefined) {
    return failure('INVALID_BRIEF');
  }

  if (meeting.brief.confirmedAt !== undefined) {
    return failure('BRIEF_ALREADY_CONFIRMED');
  }

  if (meeting.mode === undefined || !validateMeetingBriefDraft(meeting.brief, meeting.mode).ok) {
    return failure('INVALID_BRIEF');
  }

  const confirmedAt = now.toISOString();
  const snapshot: MeetingBriefSnapshot = {
    ...meeting.brief,
    assumptions: [...meeting.brief.assumptions],
    confirmed: [...meeting.brief.confirmed],
    confirmedAt,
    facilitation: {
      ...meeting.brief.facilitation,
      closingChecklist: [...meeting.brief.facilitation.closingChecklist],
    },
    readiness: {
      ...meeting.brief.readiness,
      dimensions: meeting.brief.readiness.dimensions.map((dimension) => ({ ...dimension })),
    },
    unknowns: [...meeting.brief.unknowns],
  };

  return { ok: true, value: { ...meeting, brief: snapshot, updatedAt: confirmedAt } };
}

export function markMapReady(meeting: Meeting, now: Date): Result<Meeting, MeetingDomainErrorCode> {
  if (!validNow(now)) return failure('INVALID_TIME_RANGE');
  if (meeting.status !== 'PREPARING' || meeting.preparationStage !== 'BRIEF_READY') {
    return failure('INVALID_MEETING_STATE');
  }

  if (meeting.brief?.confirmedAt === undefined) {
    return failure('BRIEF_NOT_CONFIRMED');
  }

  return {
    ok: true,
    value: updated({ ...meeting, preparationStage: 'MAP_READY' }, now),
  };
}

export function resumeGrill(meeting: Meeting, now: Date): Result<Meeting, MeetingDomainErrorCode> {
  if (!validNow(now)) return failure('INVALID_TIME_RANGE');
  if (
    meeting.status !== 'PREPARING' ||
    (meeting.preparationStage !== 'BRIEF_READY' && meeting.preparationStage !== 'MAP_READY') ||
    meeting.mode === undefined
  ) {
    return failure('INVALID_MEETING_STATE');
  }

  return {
    ok: true,
    value: updated(
      {
        ...meeting,
        activeTopicNodeId: undefined,
        brief: undefined,
        preparationStage: 'GRILLING',
        report: undefined,
      },
      now,
    ),
  };
}

export function restartPreparation(
  meeting: Meeting,
  now: Date,
): Result<Meeting, MeetingDomainErrorCode> {
  if (!validNow(now)) return failure('INVALID_TIME_RANGE');
  if (meeting.status !== 'PREPARING' || meeting.preparationStage === 'DRAFT') {
    return failure('INVALID_MEETING_STATE');
  }

  return {
    ok: true,
    value: updated(
      {
        ...meeting,
        activeTopicNodeId: undefined,
        brief: undefined,
        mode: undefined,
        modeReason: undefined,
        preparationStage: 'DRAFT',
        report: undefined,
      },
      now,
    ),
  };
}
