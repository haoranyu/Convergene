import { describe, expect, it } from 'vitest';

import { createMapReadyMeeting } from '@/fixtures/meeting';

import { correctMeetingEndTime, endMeeting, startMeeting } from './lifecycle';

describe('meeting lifecycle', () => {
  it('starts only a map-ready meeting and records a single attendee snapshot', () => {
    const result = startMeeting(createMapReadyMeeting(), 6, new Date('2026-08-29T10:00:00.000Z'));

    expect(result).toMatchObject({
      ok: true,
      value: {
        actualAttendeeCount: 6,
        startedAt: '2026-08-29T10:00:00.000Z',
        status: 'LIVE',
      },
    });
  });

  it('rejects a start when another meeting is active or the attendee count is invalid', () => {
    expect(
      startMeeting(createMapReadyMeeting(), 3, new Date('2026-08-29T10:00:00.000Z'), 'meeting-2'),
    ).toMatchObject({ error: { code: 'ACTIVE_MEETING_EXISTS' }, ok: false });
    expect(
      startMeeting(createMapReadyMeeting(), 0, new Date('2026-08-29T10:00:00.000Z')),
    ).toMatchObject({ error: { code: 'INVALID_ATTENDEE_COUNT' }, ok: false });
  });

  it('ends a live meeting and allows a final attendee correction', () => {
    const live = createMapReadyMeeting({
      actualAttendeeCount: 4,
      startedAt: '2026-08-29T10:00:00.000Z',
      status: 'LIVE',
    });
    const result = endMeeting(live, new Date('2026-08-29T10:45:00.000Z'), 5);

    expect(result).toMatchObject({
      ok: true,
      value: {
        actualAttendeeCount: 5,
        endedAt: '2026-08-29T10:45:00.000Z',
        status: 'ENDED',
      },
    });
  });

  it('keeps ENDED irreversible', () => {
    const ended = createMapReadyMeeting({
      actualAttendeeCount: 4,
      endedAt: '2026-08-29T10:45:00.000Z',
      startedAt: '2026-08-29T10:00:00.000Z',
      status: 'ENDED',
    });

    expect(startMeeting(ended, 4, new Date('2026-08-29T11:00:00.000Z'))).toMatchObject({
      error: { code: 'INVALID_MEETING_STATE' },
      ok: false,
    });
  });

  it('validates corrected end times against start and the current time', () => {
    const ended = createMapReadyMeeting({
      actualAttendeeCount: 4,
      endedAt: '2026-08-29T10:45:00.000Z',
      startedAt: '2026-08-29T10:00:00.000Z',
      status: 'ENDED',
    });
    const now = new Date('2026-08-29T12:00:00.000Z');

    expect(correctMeetingEndTime(ended, new Date('2026-08-29T09:59:00.000Z'), now)).toMatchObject({
      error: { code: 'INVALID_TIME_RANGE' },
      ok: false,
    });
    expect(correctMeetingEndTime(ended, new Date('2026-08-29T12:01:00.000Z'), now)).toMatchObject({
      error: { code: 'INVALID_TIME_RANGE' },
      ok: false,
    });
    expect(correctMeetingEndTime(ended, new Date('2026-08-29T11:30:00.000Z'), now)).toMatchObject({
      ok: true,
      value: { endedAt: '2026-08-29T11:30:00.000Z' },
    });
  });
});
