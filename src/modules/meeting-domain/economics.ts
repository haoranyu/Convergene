import type { Result } from '@/modules/shared';

import type { Meeting, MeetingDomainErrorCode, MeetingOutcome } from './model';

export interface OutcomeFormationCost {
  outcomeId: string;
  formationPersonMinutes: number;
}

export interface MeetingEconomics {
  totalPersonMinutes: number;
  unallocatedPersonMinutes: number;
  overtimeMinutes: number;
  formationCosts: OutcomeFormationCost[];
}

function failure(code: MeetingDomainErrorCode): Result<never, MeetingDomainErrorCode> {
  return { error: { code }, ok: false };
}

function minutes(milliseconds: number): number {
  return milliseconds / 60_000;
}

export function calculateMeetingEconomics(
  meeting: Meeting,
  outcomes: readonly MeetingOutcome[],
  now: Date,
): Result<MeetingEconomics, MeetingDomainErrorCode> {
  if (outcomes.some((outcome) => outcome.meetingId !== meeting.id)) {
    return failure('INVALID_OUTCOME');
  }

  if (
    meeting.status === 'PREPARING' ||
    meeting.startedAt === undefined ||
    meeting.actualAttendeeCount === undefined ||
    !Number.isInteger(meeting.actualAttendeeCount) ||
    meeting.actualAttendeeCount <= 0
  ) {
    return failure('INVALID_MEETING_STATE');
  }

  const startedAt = Date.parse(meeting.startedAt);
  const scheduledEndAt = Date.parse(meeting.scheduledEndAt);
  const effectiveEnd =
    meeting.status === 'ENDED' ? Date.parse(meeting.endedAt ?? '') : now.getTime();

  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(scheduledEndAt) ||
    !Number.isFinite(effectiveEnd) ||
    effectiveEnd < startedAt
  ) {
    return failure('INVALID_TIME_RANGE');
  }

  const liveOutcomes = outcomes
    .filter((outcome) => outcome.origin === 'LIVE')
    .map((outcome) => ({ outcome, markedAt: Date.parse(outcome.markedAt ?? '') }))
    .sort(
      (left, right) =>
        left.markedAt - right.markedAt || left.outcome.id.localeCompare(right.outcome.id),
    );

  if (
    liveOutcomes.some(
      ({ markedAt }) =>
        !Number.isFinite(markedAt) || markedAt < startedAt || markedAt > effectiveEnd,
    )
  ) {
    return failure('INVALID_TIME_RANGE');
  }

  const attendeeCount = meeting.actualAttendeeCount;
  let previousTimestamp = startedAt;
  const formationCosts = liveOutcomes.map(({ markedAt, outcome }) => {
    const formationPersonMinutes = minutes(markedAt - previousTimestamp) * attendeeCount;
    previousTimestamp = markedAt;
    return { formationPersonMinutes, outcomeId: outcome.id };
  });

  const totalPersonMinutes = minutes(effectiveEnd - startedAt) * attendeeCount;
  const unallocatedPersonMinutes = minutes(effectiveEnd - previousTimestamp) * attendeeCount;

  return {
    ok: true,
    value: {
      formationCosts,
      overtimeMinutes: Math.max(0, minutes(effectiveEnd - scheduledEndAt)),
      totalPersonMinutes,
      unallocatedPersonMinutes,
    },
  };
}
