import { describe, expect, it } from 'vitest';

import { createMapReadyMeeting, createMeeting } from '@/fixtures/meeting';

import { groupMeetings, meetingCardStateKey, staleLiveMeetings } from './meeting-groups';

describe('dashboard meeting groups', () => {
  it('keeps lifecycle and canonical timing groups deterministic', () => {
    const meetings = [
      createMeeting({ id: 'draft' }),
      createMapReadyMeeting({ id: 'waiting' }),
      createMapReadyMeeting({
        activeTopicNodeId: 'topic-1',
        actualAttendeeCount: 4,
        id: 'live',
        startedAt: '2026-08-29T10:00:00.000Z',
        status: 'LIVE',
        updatedAt: '2026-08-29T10:00:00.000Z',
      }),
      createMapReadyMeeting({
        actualAttendeeCount: 4,
        endedAt: '2026-08-29T10:30:00.000Z',
        id: 'ended',
        startedAt: '2026-08-29T10:00:00.000Z',
        status: 'ENDED',
        updatedAt: '2026-08-29T10:30:00.000Z',
      }),
    ];

    expect(
      groupMeetings(meetings, new Date('2026-08-29T10:30:00.000Z')).map((group) => [
        group.id,
        group.meetings.map((m) => m.id),
      ]),
    ).toEqual([
      ['active', ['live']],
      ['waiting', ['draft', 'waiting']],
      ['preparing', []],
      ['ended', ['ended']],
    ]);
  });

  it('keeps a map-ready meeting in preparation until its scheduled start', () => {
    const waiting = createMapReadyMeeting({ id: 'waiting' });

    expect(
      groupMeetings([waiting], new Date('2026-08-29T09:59:59.000Z')).map((group) => [
        group.id,
        group.meetings.map((meeting) => meeting.id),
      ]),
    ).toEqual([
      ['active', []],
      ['waiting', []],
      ['preparing', ['waiting']],
      ['ended', []],
    ]);
  });

  it('keeps an early draft in preparation until its scheduled start', () => {
    const draft = createMeeting({ id: 'draft' });

    expect(
      groupMeetings([draft], new Date('2026-08-29T09:59:59.000Z')).map((group) => [
        group.id,
        group.meetings.map((meeting) => meeting.id),
      ]),
    ).toEqual([
      ['active', []],
      ['waiting', []],
      ['preparing', ['draft']],
      ['ended', []],
    ]);
  });

  it('raises only genuinely overdue live meetings in the recovery banner', () => {
    const live = createMapReadyMeeting({
      activeTopicNodeId: 'topic-1',
      actualAttendeeCount: 4,
      id: 'live',
      startedAt: '2026-08-29T10:00:00.000Z',
      status: 'LIVE',
      updatedAt: '2026-08-29T10:00:00.000Z',
    });

    expect(staleLiveMeetings([live], new Date('2026-08-29T10:59:59.000Z'))).toEqual([]);
    expect(staleLiveMeetings([live], new Date('2026-08-29T11:00:01.000Z'))).toEqual([live]);
  });

  it('projects canonical timing state into meeting-card copy keys', () => {
    const draft = createMeeting();
    const live = createMapReadyMeeting({
      actualAttendeeCount: 4,
      startedAt: '2026-08-29T10:00:00.000Z',
      status: 'LIVE',
    });
    const endedOnTime = createMapReadyMeeting({
      actualAttendeeCount: 4,
      endedAt: '2026-08-29T10:30:00.000Z',
      startedAt: '2026-08-29T10:00:00.000Z',
      status: 'ENDED',
    });
    const endedOverrun = createMapReadyMeeting({
      actualAttendeeCount: 4,
      endedAt: '2026-08-29T11:00:01.000Z',
      startedAt: '2026-08-29T10:00:00.000Z',
      status: 'ENDED',
    });

    expect(meetingCardStateKey(draft, new Date('2026-08-29T09:30:00.000Z'))).toBe('draft');
    expect(meetingCardStateKey(draft, new Date('2026-08-29T10:30:00.000Z'))).toBe(
      'waiting_to_start',
    );
    expect(meetingCardStateKey(live, new Date('2026-08-29T10:30:00.000Z'))).toBe('live');
    expect(meetingCardStateKey(live, new Date('2026-08-29T11:00:01.000Z'))).toBe('live_overrun');
    expect(meetingCardStateKey(endedOnTime, new Date('2026-08-29T12:00:00.000Z'))).toBe(
      'ended_on_time',
    );
    expect(meetingCardStateKey(endedOverrun, new Date('2026-08-29T12:00:00.000Z'))).toBe(
      'ended_overrun',
    );
  });
});
