import { describe, expect, it } from 'vitest';

import { deriveTimingState } from './derive-timing-state';
import type { MeetingTiming } from './model';

const scheduledMeeting: MeetingTiming = {
  scheduledEndAt: '2026-08-29T11:00:00.000Z',
  scheduledStartAt: '2026-08-29T10:00:00.000Z',
  status: 'PREPARING',
};

describe('deriveTimingState', () => {
  it('derives schedule display state without mutating lifecycle status', () => {
    expect(deriveTimingState(scheduledMeeting, new Date('2026-08-29T09:00:00.000Z'))).toBe(
      'BEFORE_SCHEDULE',
    );
    expect(deriveTimingState(scheduledMeeting, new Date('2026-08-29T10:30:00.000Z'))).toBe(
      'WITHIN_SCHEDULE',
    );
    expect(deriveTimingState(scheduledMeeting, new Date('2026-08-29T11:30:00.000Z'))).toBe(
      'OVERRUN',
    );
    expect(scheduledMeeting.status).toBe('PREPARING');
  });

  it('treats an ended meeting as finished regardless of schedule', () => {
    expect(
      deriveTimingState(
        { ...scheduledMeeting, endedAt: '2026-08-29T10:45:00.000Z', status: 'ENDED' },
        new Date('2026-08-29T10:50:00.000Z'),
      ),
    ).toBe('FINISHED');
  });
});
