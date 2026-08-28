import { describe, expect, it } from 'vitest';

import { createMeeting } from '@/fixtures/meeting';

import { deriveTimingState } from './derive-timing-state';

describe('deriveTimingState', () => {
  it('derives preparation display state without changing lifecycle when schedule passes', () => {
    const meeting = createMeeting();

    expect(deriveTimingState(meeting, new Date('2026-08-29T09:00:00.000Z'))).toBe('PREPARING');
    expect(deriveTimingState(meeting, new Date('2026-08-29T10:30:00.000Z'))).toBe(
      'WAITING_TO_START',
    );
    expect(deriveTimingState(meeting, new Date('2026-08-29T12:00:00.000Z'))).toBe(
      'WAITING_TO_START',
    );
    expect(meeting.status).toBe('PREPARING');
  });

  it('uses lifecycle before schedule when a meeting starts early', () => {
    const meeting = createMeeting({ status: 'LIVE' });

    expect(deriveTimingState(meeting, new Date('2026-08-29T09:30:00.000Z'))).toBe('LIVE');
    expect(deriveTimingState(meeting, new Date('2026-08-29T11:00:00.000Z'))).toBe('LIVE');
    expect(deriveTimingState(meeting, new Date('2026-08-29T11:00:00.001Z'))).toBe('LIVE_OVERRUN');
  });

  it('distinguishes ended-on-time and ended-overrun using the frozen end time', () => {
    expect(
      deriveTimingState(
        createMeeting({ endedAt: '2026-08-29T10:45:00.000Z', status: 'ENDED' }),
        new Date('2026-08-30T10:00:00.000Z'),
      ),
    ).toBe('ENDED_ON_TIME');
    expect(
      deriveTimingState(
        createMeeting({ endedAt: '2026-08-29T11:05:00.000Z', status: 'ENDED' }),
        new Date('2026-08-29T11:06:00.000Z'),
      ),
    ).toBe('ENDED_OVERRUN');
  });

  it('rejects invalid schedules and ended meetings without an end timestamp', () => {
    expect(() =>
      deriveTimingState(createMeeting({ status: 'ENDED' }), new Date('2026-08-29T11:00:00.000Z')),
    ).toThrow(RangeError);
    expect(() =>
      deriveTimingState(
        createMeeting({ scheduledEndAt: '2026-08-29T09:00:00.000Z' }),
        new Date('2026-08-29T11:00:00.000Z'),
      ),
    ).toThrow(RangeError);
  });
});
