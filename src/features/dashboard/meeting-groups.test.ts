import { describe, expect, it } from 'vitest';

import { createMapReadyMeeting, createMeeting } from '@/fixtures/meeting';

import { groupMeetings, staleLiveMeetings } from './meeting-groups';

describe('dashboard meeting groups', () => {
  it('keeps lifecycle and preparation groups deterministic', () => {
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
      groupMeetings(meetings).map((group) => [group.id, group.meetings.map((m) => m.id)]),
    ).toEqual([
      ['active', ['live']],
      ['waiting', ['waiting']],
      ['preparing', ['draft']],
      ['ended', ['ended']],
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
});
