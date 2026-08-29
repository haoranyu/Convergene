import { describe, expect, it } from 'vitest';

import { createMapReadyMeeting, createMeeting } from '@/fixtures/meeting';

import { meetingHref } from './meeting-navigation';

describe('meeting navigation', () => {
  it('routes every pre-map preparation stage back to its workspace', () => {
    for (const preparationStage of ['DRAFT', 'GRILLING', 'BRIEF_READY'] as const) {
      expect(meetingHref(createMeeting({ preparationStage }))).toBe('/meetings/meeting-1/prepare');
    }

    expect(meetingHref(createMapReadyMeeting())).toBe('/meetings/meeting-1');
  });
});
