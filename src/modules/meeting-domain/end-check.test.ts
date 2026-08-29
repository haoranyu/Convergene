import { describe, expect, it } from 'vitest';

import { createMapReadyMeeting } from '@/fixtures/meeting';

import { buildMeetingEndCheck } from './end-check';
import type { MeetingOutcome } from './model';
import { defaultOutcomeKind } from './outcomes';

const liveMeeting = createMapReadyMeeting({
  actualAttendeeCount: 4,
  startedAt: '2026-08-29T10:00:00.000Z',
  status: 'LIVE',
});

const outcomes: MeetingOutcome[] = [
  {
    id: 'outcome-1',
    kind: 'DECISION',
    markedAt: '2026-08-29T10:10:00.000Z',
    meetingId: liveMeeting.id,
    nodeId: 'node-1',
    origin: 'LIVE',
  },
  {
    id: 'outcome-2',
    kind: 'ACTION',
    markedAt: '2026-08-29T10:20:00.000Z',
    meetingId: liveMeeting.id,
    nodeId: 'node-2',
    origin: 'LIVE',
    owner: '   ',
  },
  {
    dueDate: '2026-09-01',
    id: 'outcome-3',
    kind: 'ACTION',
    markedAt: '2026-08-29T10:30:00.000Z',
    meetingId: liveMeeting.id,
    nodeId: 'node-3',
    origin: 'LIVE',
    owner: 'Casey',
  },
];

describe('meeting end check', () => {
  it('summarizes outcomes, action gaps, time, overrun, and recalculated person-time', () => {
    const result = buildMeetingEndCheck(
      liveMeeting,
      outcomes,
      { parkingLotCount: 2 },
      5,
      new Date('2026-08-29T11:15:00.000Z'),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        actionMissingDueDateCount: 1,
        actionMissingOwnerCount: 1,
        attendeeCount: 5,
        economics: {
          formationCosts: [
            { formationPersonMinutes: 50, outcomeId: 'outcome-1' },
            { formationPersonMinutes: 50, outcomeId: 'outcome-2' },
            { formationPersonMinutes: 50, outcomeId: 'outcome-3' },
          ],
          overtimeMinutes: 15,
          totalPersonMinutes: 375,
          unallocatedPersonMinutes: 225,
        },
        elapsedMinutes: 75,
        hasNoOutcomes: false,
        incompleteActionCount: 1,
        outcomesByKind: { ACTION: 2, CANDIDATE_IDEA: 0, DECISION: 1, INSIGHT: 0 },
        outcomeCount: 3,
        parkingLotCount: 2,
        unresolvedCount: 1,
      },
    });
  });

  it('keeps a zero-outcome meeting endable and assigns all person-time to unallocated time', () => {
    const result = buildMeetingEndCheck(
      liveMeeting,
      [],
      { parkingLotCount: 0 },
      4,
      new Date('2026-08-29T10:30:00.000Z'),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        economics: { totalPersonMinutes: 120, unallocatedPersonMinutes: 120 },
        hasNoOutcomes: true,
        outcomeCount: 0,
      },
    });
  });

  it('rejects invalid attendee corrections without changing the meeting', () => {
    expect(
      buildMeetingEndCheck(
        liveMeeting,
        outcomes,
        { parkingLotCount: 0 },
        0,
        new Date('2026-08-29T10:30:00.000Z'),
      ),
    ).toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });
    expect(liveMeeting.actualAttendeeCount).toBe(4);
  });

  it('preselects an outcome kind from the stable meeting script', () => {
    expect(defaultOutcomeKind('DECISION')).toBe('DECISION');
    expect(defaultOutcomeKind('BRAINSTORM')).toBe('CANDIDATE_IDEA');
    expect(defaultOutcomeKind('RETRO')).toBe('INSIGHT');
    expect(defaultOutcomeKind('GENERAL')).toBe('INSIGHT');
  });
});
