import type { Result } from '@/modules/shared';

import type { Meeting, MeetingDomainErrorCode } from './model';

function failure(code: MeetingDomainErrorCode): Result<never, MeetingDomainErrorCode> {
  return { error: { code }, ok: false };
}

function validAttendeeCount(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function startMeeting(
  meeting: Meeting,
  attendeeCount: number,
  now: Date,
  activeMeetingId?: string,
): Result<Meeting, MeetingDomainErrorCode> {
  if (meeting.status !== 'PREPARING' || meeting.preparationStage !== 'MAP_READY') {
    return failure('INVALID_MEETING_STATE');
  }

  if (activeMeetingId !== undefined) {
    return failure('ACTIVE_MEETING_EXISTS');
  }

  if (!validAttendeeCount(attendeeCount)) {
    return failure('INVALID_ATTENDEE_COUNT');
  }

  if (!Number.isFinite(now.getTime())) {
    return failure('INVALID_TIME_RANGE');
  }

  const startedAt = now.toISOString();

  return {
    ok: true,
    value: {
      ...meeting,
      actualAttendeeCount: attendeeCount,
      endedAt: undefined,
      startedAt,
      status: 'LIVE',
      updatedAt: startedAt,
    },
  };
}

export function endMeeting(
  meeting: Meeting,
  now: Date,
  attendeeCount = meeting.actualAttendeeCount,
): Result<Meeting, MeetingDomainErrorCode> {
  if (meeting.status !== 'LIVE' || meeting.startedAt === undefined) {
    return failure('INVALID_MEETING_STATE');
  }

  if (attendeeCount === undefined || !validAttendeeCount(attendeeCount)) {
    return failure('INVALID_ATTENDEE_COUNT');
  }

  const startedAt = Date.parse(meeting.startedAt);
  const endedAt = now.getTime();

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return failure('INVALID_TIME_RANGE');
  }

  const timestamp = now.toISOString();

  return {
    ok: true,
    value: {
      ...meeting,
      actualAttendeeCount: attendeeCount,
      endedAt: timestamp,
      status: 'ENDED',
      updatedAt: timestamp,
    },
  };
}

export function correctMeetingEndTime(
  meeting: Meeting,
  correctedEnd: Date,
  now: Date,
): Result<Meeting, MeetingDomainErrorCode> {
  if (meeting.status !== 'ENDED' || meeting.startedAt === undefined) {
    return failure('INVALID_MEETING_STATE');
  }

  const startedAt = Date.parse(meeting.startedAt);
  const correctedAt = correctedEnd.getTime();
  const currentTime = now.getTime();

  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(correctedAt) ||
    !Number.isFinite(currentTime) ||
    correctedAt < startedAt ||
    correctedAt > currentTime
  ) {
    return failure('INVALID_TIME_RANGE');
  }

  return {
    ok: true,
    value: {
      ...meeting,
      endedAt: correctedEnd.toISOString(),
      updatedAt: now.toISOString(),
    },
  };
}
