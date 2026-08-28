import { describe, expect, it } from 'vitest';

import { createMapReadyMeeting } from '@/fixtures/meeting';

import { calculateMeetingEconomics } from './economics';
import { markOutcome, unmarkOutcome } from './outcomes';
import type { MeetingOutcome } from './model';

const endedMeeting = createMapReadyMeeting({
  actualAttendeeCount: 4,
  endedAt: '2026-08-29T11:00:00.000Z',
  startedAt: '2026-08-29T10:00:00.000Z',
  status: 'ENDED',
});

const outcomes: MeetingOutcome[] = [
  {
    id: 'outcome-1',
    kind: 'DECISION',
    markedAt: '2026-08-29T10:15:00.000Z',
    meetingId: endedMeeting.id,
    nodeId: 'node-1',
    origin: 'LIVE',
  },
  {
    id: 'outcome-2',
    kind: 'ACTION',
    markedAt: '2026-08-29T10:35:00.000Z',
    meetingId: endedMeeting.id,
    nodeId: 'node-2',
    origin: 'LIVE',
  },
  {
    id: 'outcome-3',
    kind: 'INSIGHT',
    meetingId: endedMeeting.id,
    nodeId: 'node-3',
    origin: 'POST_MEETING',
  },
];

describe('meeting outcomes and economics', () => {
  it('calculates total, formation, and unallocated person-minutes deterministically', () => {
    expect(
      calculateMeetingEconomics(endedMeeting, outcomes, new Date('2026-08-29T12:00:00.000Z')),
    ).toEqual({
      ok: true,
      value: {
        formationCosts: [
          { formationPersonMinutes: 60, outcomeId: 'outcome-1' },
          { formationPersonMinutes: 80, outcomeId: 'outcome-2' },
        ],
        overtimeMinutes: 0,
        totalPersonMinutes: 240,
        unallocatedPersonMinutes: 100,
      },
    });
  });

  it('uses now for LIVE cumulative person-time without inventing endedAt', () => {
    const liveMeeting = { ...endedMeeting, endedAt: undefined, status: 'LIVE' as const };

    expect(
      calculateMeetingEconomics(
        liveMeeting,
        outcomes.slice(0, 1),
        new Date('2026-08-29T10:30:00.000Z'),
      ),
    ).toMatchObject({
      ok: true,
      value: { totalPersonMinutes: 120, unallocatedPersonMinutes: 60 },
    });
    expect(liveMeeting.endedAt).toBeUndefined();
  });

  it('recalculates remaining formation costs after an outcome is removed', () => {
    const remaining = unmarkOutcome(outcomes, 'outcome-1');
    expect(remaining.ok).toBe(true);
    if (!remaining.ok) return;

    expect(
      calculateMeetingEconomics(
        endedMeeting,
        remaining.value,
        new Date('2026-08-29T12:00:00.000Z'),
      ),
    ).toMatchObject({
      ok: true,
      value: {
        formationCosts: [{ formationPersonMinutes: 140, outcomeId: 'outcome-2' }],
        unallocatedPersonMinutes: 100,
      },
    });
  });

  it('marks outcomes only from user lifecycle state and rejects a second outcome for one node', () => {
    const live = { ...endedMeeting, endedAt: undefined, status: 'LIVE' as const };
    const marked = markOutcome(
      live,
      [],
      { id: 'new-outcome', kind: 'ACTION', nodeId: 'node-4', owner: 'Casey' },
      new Date('2026-08-29T10:40:00.000Z'),
    );

    expect(marked).toMatchObject({
      ok: true,
      value: { markedAt: '2026-08-29T10:40:00.000Z', origin: 'LIVE' },
    });
    if (!marked.ok) return;

    expect(
      markOutcome(
        live,
        [marked.value],
        { id: 'duplicate', kind: 'INSIGHT', nodeId: 'node-4' },
        new Date('2026-08-29T10:41:00.000Z'),
      ),
    ).toMatchObject({ error: { code: 'OUTCOME_ALREADY_EXISTS' }, ok: false });
  });
});
