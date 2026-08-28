import { describe, expect, it } from 'vitest';

import { briefDraft, createMeeting } from '@/fixtures/meeting';

import {
  completeGrill,
  confirmBrief,
  confirmMeetingMode,
  markMapReady,
  restartPreparation,
  resumeGrill,
} from './preparation';

const now = new Date('2026-08-29T09:30:00.000Z');

describe('preparation transitions', () => {
  it('moves through DRAFT, GRILLING, BRIEF_READY, and MAP_READY', () => {
    const mode = confirmMeetingMode(createMeeting(), 'DECISION', 'A choice is required', now);
    expect(mode.ok).toBe(true);
    if (!mode.ok) return;

    const brief = completeGrill(mode.value, briefDraft, now);
    expect(brief.ok).toBe(true);
    if (!brief.ok) return;

    const confirmed = confirmBrief(brief.value, now);
    expect(confirmed).toMatchObject({
      ok: true,
      value: { brief: { confirmedAt: now.toISOString() }, preparationStage: 'BRIEF_READY' },
    });
    if (!confirmed.ok) return;

    expect(markMapReady(confirmed.value, now)).toMatchObject({
      ok: true,
      value: { preparationStage: 'MAP_READY' },
    });
  });

  it('locks a confirmed Brief and keeps it locked while initial map generation is retried', () => {
    const meeting = createMeeting({
      brief: { ...briefDraft, confirmedAt: now.toISOString() },
      mode: 'DECISION',
      preparationStage: 'BRIEF_READY',
    });

    expect(confirmBrief(meeting, now)).toMatchObject({
      error: { code: 'BRIEF_ALREADY_CONFIRMED' },
      ok: false,
    });
    expect(meeting.preparationStage).toBe('BRIEF_READY');
    expect(meeting.brief?.confirmedAt).toBe(now.toISOString());
  });

  it('separates continuing questions from restarting preparation', () => {
    const prepared = createMeeting({
      brief: { ...briefDraft, confirmedAt: now.toISOString() },
      mode: 'DECISION',
      modeReason: 'A choice is required',
      preparationStage: 'MAP_READY',
    });

    expect(resumeGrill(prepared, now)).toMatchObject({
      ok: true,
      value: { brief: undefined, mode: 'DECISION', preparationStage: 'GRILLING' },
    });
    expect(restartPreparation(prepared, now)).toMatchObject({
      ok: true,
      value: { brief: undefined, mode: undefined, preparationStage: 'DRAFT' },
    });
  });
});
