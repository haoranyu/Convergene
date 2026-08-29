import { describe, expect, it } from 'vitest';

import { createReportFixture } from '@/fixtures/report';
import type { MeetingMode } from '@/modules/meeting-domain';

import { buildReportFacts } from './facts';
import { reportModeFactKeys } from './types';

const modes: MeetingMode[] = ['DECISION', 'BRAINSTORM', 'RETRO', 'GENERAL'];

describe('report fact draft', () => {
  it.each(modes)('builds the common and %s-specific facts from one local aggregate', (mode) => {
    const aggregate = createReportFixture({ mode });
    const result = buildReportFacts(aggregate, 'Asia/Singapore');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      attendeeCount: 4,
      mode,
      objective: 'Choose the launch plan',
      overtimeMinutes: 15,
      schedule: { timezone: 'Asia/Singapore' },
      totalPersonMinutes: 300,
      unallocatedPersonMinutes: 200,
    });
    expect(result.value.outcomes.map((outcome) => outcome.formationPersonMinutes)).toEqual([
      60, 40,
    ]);
    expect(reportModeFactKeys[mode].some((key) => result.value.modeFacts[key].length > 0)).toBe(
      true,
    );
  });

  it('assigns all effort to unallocated time when no outcome was marked', () => {
    const aggregate = createReportFixture({ outcomes: [] });
    const result = buildReportFacts(aggregate, 'UTC');

    expect(result).toMatchObject({
      ok: true,
      value: {
        outcomes: [],
        totalPersonMinutes: 300,
        unallocatedPersonMinutes: 300,
      },
    });
  });

  it('rejects report facts before the meeting is ended', () => {
    const aggregate = createReportFixture();
    aggregate.meeting = {
      ...aggregate.meeting,
      endedAt: undefined,
      status: 'LIVE',
    };

    expect(buildReportFacts(aggregate, 'UTC')).toMatchObject({
      error: { code: 'INVALID_MEETING_STATE' },
      ok: false,
    });
  });

  it('rejects an invalid IANA timezone before localized rendering', () => {
    expect(buildReportFacts(createReportFixture(), 'Mars/Olympus_Mons')).toMatchObject({
      error: { code: 'INVALID_MEETING' },
      ok: false,
    });
  });
});
