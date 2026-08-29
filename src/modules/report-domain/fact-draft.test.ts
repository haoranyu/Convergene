import { describe, expect, it } from 'vitest';

import {
  brainstormScenario,
  decisionScenario,
  generalScenario,
  hostileTextScenario,
  noOutcomeScenario,
  retroScenario,
} from '@/fixtures/report-domain';
import { buildFactDraft, toReportAIFacts } from '@/modules/report-domain';

function buildFacts(scenario: ReturnType<typeof decisionScenario>) {
  const result = buildFactDraft(scenario.meeting, scenario.graph, scenario.outcomes, {
    timezone: scenario.timezone,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`fixture must build facts: ${result.error.code}`);
  return result.value;
}

describe('buildFactDraft', () => {
  it('derives the common base and DECISION mode facts', () => {
    const facts = buildFacts(decisionScenario());

    expect(facts.mode).toBe('DECISION');
    expect(facts.title).toBe('Launch decision');
    expect(facts.objective).toBe('Choose the launch plan');
    expect(facts.schedule).toEqual({
      actual: { end: '2026-08-29T11:10:00.000Z', start: '2026-08-29T10:00:00.000Z' },
      planned: { end: '2026-08-29T11:00:00.000Z', start: '2026-08-29T10:00:00.000Z' },
      timezone: 'Asia/Shanghai',
    });
    expect(facts.attendeeCount).toBe(4);
    expect(facts.totalPersonMinutes).toBe(280);
    expect(facts.overtimeMinutes).toBe(10);
    expect(facts.unallocatedPersonMinutes).toBe(120);
    expect(facts.parkingLot).toEqual(['Mobile app scope']);
    expect(facts.unknowns).toEqual(['Final legal review date']);
    expect(facts.modeFacts).toEqual({
      decisions: ['Guided rollout'],
      risks: ['Data migration risk'],
      unchosenOptions: ['Big-bang launch'],
    });
  });

  it('derives BRAINSTORM mode facts from outcomes, graph, and brief assumptions', () => {
    const facts = buildFacts(brainstormScenario());

    expect(facts.modeFacts).toEqual({
      assumptions: ['New users tolerate a guided checklist'],
      candidateIdeas: ['Gamified checklist', 'Concierge onboarding call'],
      exploredIdeas: [
        'Gamified checklist',
        'Concierge onboarding call',
        'AI-generated sample workspace',
      ],
    });
  });

  it('derives RETRO mode facts including post-meeting insights', () => {
    const facts = buildFacts(retroScenario());

    expect(facts.mode).toBe('RETRO');
    expect(facts.modeFacts).toEqual({
      improvementActions: ['Add load-test gate to CI'],
      insights: ['Load test was skipped', 'Alert fatigue hid the first signal'],
    });
  });

  it('derives no mode facts for the GENERAL fallback', () => {
    const facts = buildFacts(generalScenario());

    expect(facts.mode).toBe('GENERAL');
    expect(facts.modeFacts).toEqual({});
  });

  it('distinguishes LIVE outcomes from POST_MEETING additions', () => {
    const facts = buildFacts(decisionScenario());

    const live = facts.outcomes.filter((outcome) => outcome.origin === 'LIVE');
    const postMeeting = facts.outcomes.filter((outcome) => outcome.origin === 'POST_MEETING');

    expect(live.map((outcome) => outcome.title)).toEqual([
      'Guided rollout',
      'Schedule rollback rehearsal',
    ]);
    expect(postMeeting.map((outcome) => outcome.title)).toEqual(['Data migration risk']);
    for (const outcome of live) {
      expect(outcome.markedAt).toBeDefined();
      expect(outcome.formationPersonMinutes).toBeTypeOf('number');
    }
  });

  it('keeps formation costs aligned with the meeting-domain economics algorithm', () => {
    const facts = buildFacts(decisionScenario());
    const costs = facts.outcomes.map((outcome) => outcome.formationPersonMinutes);

    expect(costs).toEqual([60, 100, undefined]);
  });

  it('preserves missing owner, due date, note, and formation cost as missing', () => {
    const facts = buildFacts(retroScenario());
    const action = facts.outcomes.find((outcome) => outcome.kind === 'ACTION');
    const postMeeting = facts.outcomes.find((outcome) => outcome.origin === 'POST_MEETING');

    expect(action).toBeDefined();
    expect(action).not.toHaveProperty('owner');
    expect(action).not.toHaveProperty('dueDate');
    expect(action).not.toHaveProperty('note');
    expect(postMeeting).toBeDefined();
    expect(postMeeting).not.toHaveProperty('markedAt');
    expect(postMeeting).not.toHaveProperty('formationPersonMinutes');
  });

  it('supports a meeting with zero outcomes: totals stay fully unattributed', () => {
    const facts = buildFacts(noOutcomeScenario());

    expect(facts.outcomes).toEqual([]);
    expect(facts.totalPersonMinutes).toBe(140);
    expect(facts.unallocatedPersonMinutes).toBe(140);
  });

  it('falls back to the objective root node when no brief objective exists', () => {
    const scenario = generalScenario();
    const meeting = { ...scenario.meeting, brief: undefined };

    const result = buildFactDraft(meeting, scenario.graph, scenario.outcomes, {
      timezone: scenario.timezone,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.objective).toBe('Align the weekly sync');
  });

  it('projects the discussion tree with bridged parents and outcome marks', () => {
    const facts = buildFacts(retroScenario());

    expect(facts.discussionTree).toEqual([
      expect.objectContaining({ nodeId: 'n-root', parentNodeId: undefined }),
      expect.objectContaining({ nodeId: 'n-causes', parentNodeId: 'n-root', kind: 'TOPIC' }),
      expect.objectContaining({
        isOutcome: true,
        nodeId: 'n-insight-1',
        parentNodeId: 'n-causes',
      }),
      expect.objectContaining({
        isOutcome: true,
        nodeId: 'n-action-1',
        parentNodeId: 'n-insight-1',
      }),
      expect.objectContaining({
        isOutcome: true,
        nodeId: 'n-insight-2',
        parentNodeId: 'n-causes',
      }),
    ]);
  });

  it('is deterministic regardless of input array order', () => {
    const scenario = decisionScenario();
    const baseline = buildFacts(scenario);
    const shuffled = buildFacts({
      ...scenario,
      graph: {
        ...scenario.graph,
        edges: [...scenario.graph.edges].reverse(),
        nodes: [...scenario.graph.nodes].reverse(),
      },
      outcomes: [...scenario.outcomes].reverse(),
    });

    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(baseline));
  });

  it('produces JSON-serializable facts', () => {
    const facts = buildFacts(hostileTextScenario());

    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
  });

  it('rejects meetings that are not ENDED', () => {
    const scenario = decisionScenario();
    const result = buildFactDraft(
      { ...scenario.meeting, endedAt: undefined, status: 'LIVE' },
      scenario.graph,
      scenario.outcomes,
      { timezone: scenario.timezone },
    );

    expect(result).toMatchObject({ error: { code: 'MEETING_NOT_ENDED' }, ok: false });
  });

  it('rejects inverted or missing time ranges', () => {
    const scenario = decisionScenario();
    const result = buildFactDraft(
      { ...scenario.meeting, endedAt: '2026-08-29T09:00:00.000Z' },
      scenario.graph,
      scenario.outcomes,
      { timezone: scenario.timezone },
    );

    expect(result).toMatchObject({ error: { code: 'INVALID_TIME_RANGE' }, ok: false });
  });

  it('rejects a missing attendee count instead of inventing one', () => {
    const scenario = decisionScenario();
    const result = buildFactDraft(
      { ...scenario.meeting, actualAttendeeCount: undefined },
      scenario.graph,
      scenario.outcomes,
      { timezone: scenario.timezone },
    );

    expect(result).toMatchObject({ error: { code: 'INVALID_ATTENDEE_COUNT' }, ok: false });
  });

  it('rejects an unknown time zone instead of silently picking one', () => {
    const scenario = decisionScenario();
    const result = buildFactDraft(scenario.meeting, scenario.graph, scenario.outcomes, {
      timezone: 'Mars/Olympus',
    });

    expect(result).toMatchObject({ error: { code: 'INVALID_TIMEZONE' }, ok: false });
  });

  it('rejects an outcome that references a missing node', () => {
    const scenario = decisionScenario();
    const result = buildFactDraft(
      scenario.meeting,
      scenario.graph,
      [...scenario.outcomes.slice(0, 1).map((outcome) => ({ ...outcome, nodeId: 'n-ghost' }))],
      { timezone: scenario.timezone },
    );

    expect(result).toMatchObject({ error: { code: 'OUTCOME_NODE_MISSING' }, ok: false });
  });

  it('rejects data that belongs to another meeting', () => {
    const scenario = decisionScenario();
    const [firstOutcome] = scenario.outcomes;
    if (firstOutcome === undefined) throw new Error('fixture must have outcomes');

    const foreignOutcome = buildFactDraft(
      scenario.meeting,
      scenario.graph,
      [{ ...firstOutcome, meetingId: 'meeting-other' }],
      { timezone: scenario.timezone },
    );
    const foreignGraph = buildFactDraft(
      scenario.meeting,
      { ...scenario.graph, meetingId: 'meeting-other' },
      scenario.outcomes,
      { timezone: scenario.timezone },
    );

    expect(foreignOutcome).toMatchObject({ error: { code: 'INVALID_OUTCOME' }, ok: false });
    expect(foreignGraph).toMatchObject({ error: { code: 'GRAPH_INVALID' }, ok: false });
  });

  it('rejects a structurally invalid graph', () => {
    const scenario = decisionScenario();
    const [, topicNode] = scenario.graph.nodes;
    if (topicNode === undefined) throw new Error('fixture must have topic nodes');

    const orphan = { ...topicNode, id: 'n-orphan', kind: 'NOTE' as const };
    const result = buildFactDraft(
      scenario.meeting,
      { ...scenario.graph, nodes: [...scenario.graph.nodes, orphan] },
      scenario.outcomes,
      { timezone: scenario.timezone },
    );

    expect(result).toMatchObject({ error: { code: 'GRAPH_INVALID' }, ok: false });
  });
});

describe('toReportAIFacts', () => {
  it('projects exactly the ai-contracts section 9 shape', () => {
    const facts = buildFacts(decisionScenario());
    const aiFacts = toReportAIFacts(facts);

    expect(Object.keys(aiFacts).sort()).toEqual(
      [
        'attendeeCount',
        'mode',
        'modeFacts',
        'objective',
        'outcomes',
        'overtimeMinutes',
        'parkingLot',
        'schedule',
        'totalPersonMinutes',
        'unknowns',
      ].sort(),
    );
    const allowedOutcomeKeys = new Set([
      'dueDate',
      'formationPersonMinutes',
      'kind',
      'note',
      'origin',
      'owner',
      'title',
    ]);
    for (const outcome of aiFacts.outcomes) {
      for (const key of Object.keys(outcome)) {
        expect(allowedOutcomeKeys.has(key)).toBe(true);
      }
      expect(outcome).not.toHaveProperty('nodeId');
      expect(outcome).not.toHaveProperty('markedAt');
    }
    expect(aiFacts).not.toHaveProperty('title');
    expect(aiFacts).not.toHaveProperty('discussionTree');
    expect(aiFacts).not.toHaveProperty('unallocatedPersonMinutes');
    expect(aiFacts.outcomes.map((outcome) => outcome.title)).toEqual(
      facts.outcomes.map((outcome) => outcome.title),
    );
  });
});
