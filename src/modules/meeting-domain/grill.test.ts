import { describe, expect, it } from 'vitest';

import { readinessDimensions } from '@/fixtures/preparation';

import { answerGrillTurn, nextGrillPhase, validateGrillHistory } from './grill';
import type { GrillTurn } from './model';

function turn(index: number, overrides: Partial<GrillTurn> = {}): GrillTurn {
  return {
    createdAt: `2026-08-29T09:${String(30 + index).padStart(2, '0')}:00.000Z`,
    disposition: 'UNKNOWN',
    id: `turn-${index}`,
    index,
    knownState: { assumptions: [], confirmed: [], unknowns: [] },
    meetingId: 'meeting-1',
    phase: index < 5 ? 'DEFAULT' : 'USER_EXTENDED',
    question: `Question ${index + 1}`,
    readiness: { dimensions: readinessDimensions('DECISION'), level: 'INSUFFICIENT' },
    ...overrides,
  };
}

describe('Grill policy', () => {
  it('persists one pending question and completes it without changing its prompt snapshot', () => {
    const pending = turn(0, { disposition: 'PENDING' });
    const completed = answerGrillTurn(pending, 'DECISION', 'ANSWERED', 'The sponsor');
    expect(completed).toMatchObject({
      ok: true,
      value: { answer: 'The sponsor', disposition: 'ANSWERED', question: 'Question 1' },
    });
    if (!completed.ok) return;
    expect(validateGrillHistory([completed.value], 'DECISION').ok).toBe(true);
  });

  it('rejects gaps, a non-final pending question, and an eleventh turn', () => {
    expect(validateGrillHistory([turn(1)], 'DECISION').ok).toBe(false);
    expect(
      validateGrillHistory([turn(0, { disposition: 'PENDING' }), turn(1)], 'DECISION').ok,
    ).toBe(false);
    expect(
      validateGrillHistory(
        Array.from({ length: 11 }, (_, index) => turn(index)),
        'DECISION',
      ).ok,
    ).toBe(false);
  });

  it('allows at most one critical extra question and then only user extensions', () => {
    const defaults = Array.from({ length: 5 }, (_, index) => turn(index));
    expect(nextGrillPhase(defaults, 'CONTINUE_DEFAULT')).toEqual({
      ok: true,
      value: 'CRITICAL_EXTRA',
    });
    const critical = turn(5, {
      criticalExtraReason: 'Without an owner no decision can be made.',
      phase: 'CRITICAL_EXTRA',
    });
    expect(validateGrillHistory([...defaults, critical], 'DECISION').ok).toBe(true);
    expect(nextGrillPhase([...defaults, critical], 'CONTINUE_DEFAULT')).toMatchObject({
      error: { code: 'GRILL_LIMIT_REACHED' },
      ok: false,
    });
    expect(nextGrillPhase([...defaults, critical], 'CONTINUE_USER')).toEqual({
      ok: true,
      value: 'USER_EXTENDED',
    });
  });
});
