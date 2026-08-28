import type { Result } from '@/modules/shared';

import type {
  Meeting,
  MeetingBriefDraft,
  MeetingBriefSnapshot,
  MeetingDomainErrorCode,
  MeetingMode,
} from './model';

function failure(code: MeetingDomainErrorCode): Result<never, MeetingDomainErrorCode> {
  return { error: { code }, ok: false };
}

function updated(meeting: Meeting, now: Date): Meeting {
  return { ...meeting, updatedAt: now.toISOString() };
}

function validNow(now: Date): boolean {
  return Number.isFinite(now.getTime());
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

  if (brief.objective.trim() === '' || brief.desiredOutcome.trim() === '') {
    return failure('INVALID_BRIEF');
  }

  return {
    ok: true,
    value: updated({ ...meeting, brief, preparationStage: 'BRIEF_READY' }, now),
  };
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
