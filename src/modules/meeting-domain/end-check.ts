import type { Result } from '@/modules/shared';

import { calculateMeetingEconomics, type MeetingEconomics } from './economics';
import { outcomeKinds } from './model';
import type { Meeting, MeetingDomainErrorCode, MeetingOutcome, OutcomeKind } from './model';

export interface MeetingEndContext {
  parkingLotCount: number;
}

export interface MeetingEndCheck {
  actionMissingDueDateCount: number;
  actionMissingOwnerCount: number;
  attendeeCount: number;
  economics: MeetingEconomics;
  elapsedMinutes: number;
  hasNoOutcomes: boolean;
  incompleteActionCount: number;
  outcomesByKind: Record<OutcomeKind, number>;
  outcomeCount: number;
  parkingLotCount: number;
  unresolvedCount: number;
}

function failure(code: MeetingDomainErrorCode): Result<never, MeetingDomainErrorCode> {
  return { error: { code }, ok: false };
}

function validCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function present(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}

/**
 * Produces the read-only facts shown before a meeting can be ended. It accepts a
 * candidate attendee count so the user can inspect the recalculated economics
 * without mutating the persisted meeting.
 */
export function buildMeetingEndCheck(
  meeting: Meeting,
  outcomes: readonly MeetingOutcome[],
  context: MeetingEndContext,
  attendeeCount: number,
  now: Date,
): Result<MeetingEndCheck, MeetingDomainErrorCode> {
  if (meeting.status !== 'LIVE' || meeting.startedAt === undefined) {
    return failure('INVALID_MEETING_STATE');
  }

  if (!Number.isInteger(attendeeCount) || attendeeCount <= 0) {
    return failure('INVALID_ATTENDEE_COUNT');
  }

  if (!validCount(context.parkingLotCount)) {
    return failure('INVALID_MEETING');
  }

  const economics = calculateMeetingEconomics(
    { ...meeting, actualAttendeeCount: attendeeCount },
    outcomes,
    now,
  );
  if (!economics.ok) return economics;

  const outcomesByKind = Object.fromEntries(outcomeKinds.map((kind) => [kind, 0])) as Record<
    OutcomeKind,
    number
  >;
  let actionMissingDueDateCount = 0;
  let actionMissingOwnerCount = 0;
  let incompleteActionCount = 0;

  for (const outcome of outcomes) {
    outcomesByKind[outcome.kind] += 1;
    if (outcome.kind !== 'ACTION') continue;

    const missesOwner = !present(outcome.owner);
    const missesDueDate = !present(outcome.dueDate);
    if (missesOwner) actionMissingOwnerCount += 1;
    if (missesDueDate) actionMissingDueDateCount += 1;
    if (missesOwner || missesDueDate) incompleteActionCount += 1;
  }

  return {
    ok: true,
    value: {
      actionMissingDueDateCount,
      actionMissingOwnerCount,
      attendeeCount,
      economics: economics.value,
      elapsedMinutes: economics.value.totalPersonMinutes / attendeeCount,
      hasNoOutcomes: outcomes.length === 0,
      incompleteActionCount,
      outcomesByKind,
      outcomeCount: outcomes.length,
      parkingLotCount: context.parkingLotCount,
      unresolvedCount: meeting.brief?.unknowns.length ?? 0,
    },
  };
}
