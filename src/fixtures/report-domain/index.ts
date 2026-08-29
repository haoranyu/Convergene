import { briefSnapshot, createMapReadyMeeting } from '@/fixtures/meeting';
import type { Meeting, MeetingOutcome } from '@/modules/meeting-domain';
import type { MeetingGraph, MindMapEdge, MindMapNode, NodeKind } from '@/modules/mind-map-domain';

/**
 * Deterministic report-domain scenarios. All timestamps are fixed, all ids
 * are stable, and no builder reads a clock; identical calls always produce
 * identical data.
 */

export interface ReportScenario {
  meeting: Meeting;
  graph: MeetingGraph;
  outcomes: MeetingOutcome[];
  timezone: string;
}

interface NodeSpec {
  id: string;
  kind: NodeKind;
  title: string;
  parentId?: string;
  order?: number;
  note?: string;
}

const BASE_CREATED_AT = Date.parse('2026-08-29T08:00:00.000Z');

function buildGraph(meetingId: string, specs: readonly NodeSpec[]): MeetingGraph {
  const nodes: MindMapNode[] = specs.map((spec, index) => {
    const createdAt = new Date(BASE_CREATED_AT + index * 60_000).toISOString();
    return {
      createdAt,
      id: spec.id,
      kind: spec.kind,
      meetingId,
      note: spec.note,
      position: { x: 0, y: 0 },
      source: 'INITIAL_AI',
      title: spec.title,
      topicPrompt: spec.kind === 'TOPIC' ? `Prompt for ${spec.id}` : undefined,
      transitionHint: spec.kind === 'TOPIC' ? `Transition for ${spec.id}` : undefined,
      updatedAt: createdAt,
    };
  });

  const edges: MindMapEdge[] = specs
    .filter((spec) => spec.parentId !== undefined)
    .map((spec) => ({
      id: `edge-${spec.id}`,
      kind: 'CONTAINS',
      meetingId,
      order: spec.order,
      sourceNodeId: spec.parentId ?? '',
      targetNodeId: spec.id,
    }));

  return { edges, meetingId, nodes };
}

function endedMeeting(overrides: Partial<Meeting>): Meeting {
  return createMapReadyMeeting({
    actualAttendeeCount: 4,
    endedAt: '2026-08-29T11:10:00.000Z',
    startedAt: '2026-08-29T10:00:00.000Z',
    status: 'ENDED',
    ...overrides,
  });
}

export function decisionScenario(): ReportScenario {
  const meeting = endedMeeting({
    brief: {
      ...briefSnapshot,
      assumptions: ['The launch budget is approved'],
      objective: 'Choose the launch plan',
      unknowns: ['Final legal review date'],
    },
    mode: 'DECISION',
    title: 'Launch decision',
  });

  const graph = buildGraph(meeting.id, [
    { id: 'n-root', kind: 'OBJECTIVE', title: 'Choose the launch plan' },
    { id: 'n-options', kind: 'TOPIC', order: 0, parentId: 'n-root', title: 'Candidate options' },
    { id: 'n-criteria', kind: 'TOPIC', order: 1, parentId: 'n-root', title: 'Decision criteria' },
    { id: 'n-risks', kind: 'TOPIC', order: 2, parentId: 'n-root', title: 'Risks' },
    { id: 'n-option-a', kind: 'OPTION', parentId: 'n-options', title: 'Guided rollout' },
    { id: 'n-option-b', kind: 'OPTION', parentId: 'n-options', title: 'Big-bang launch' },
    { id: 'n-risk-1', kind: 'RISK', parentId: 'n-risks', title: 'Data migration risk' },
    {
      id: 'n-action-1',
      kind: 'NOTE',
      parentId: 'n-criteria',
      title: 'Schedule rollback rehearsal',
    },
    { id: 'n-parking-1', kind: 'PARKING', parentId: 'n-root', title: 'Mobile app scope' },
  ]);

  const outcomes: MeetingOutcome[] = [
    {
      id: 'oc-1',
      kind: 'DECISION',
      markedAt: '2026-08-29T10:15:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-option-a',
      origin: 'LIVE',
    },
    {
      dueDate: '2026-09-05',
      id: 'oc-2',
      kind: 'ACTION',
      markedAt: '2026-08-29T10:40:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-action-1',
      origin: 'LIVE',
      owner: 'Casey',
    },
    {
      id: 'oc-3',
      kind: 'INSIGHT',
      meetingId: meeting.id,
      nodeId: 'n-risk-1',
      note: 'Confirmed after the meeting ended',
      origin: 'POST_MEETING',
    },
  ];

  return { graph, meeting, outcomes, timezone: 'Asia/Shanghai' };
}

export function brainstormScenario(): ReportScenario {
  const meeting = endedMeeting({
    brief: {
      ...briefSnapshot,
      assumptions: ['New users tolerate a guided checklist'],
      objective: 'Improve onboarding activation',
      unknowns: ['Activation metric baseline'],
    },
    mode: 'BRAINSTORM',
    title: 'Onboarding brainstorm',
  });

  const graph = buildGraph(meeting.id, [
    { id: 'n-root', kind: 'OBJECTIVE', title: 'Improve onboarding activation' },
    {
      id: 'n-directions',
      kind: 'TOPIC',
      order: 0,
      parentId: 'n-root',
      title: 'Divergent directions',
    },
    { id: 'n-constraints', kind: 'TOPIC', order: 1, parentId: 'n-root', title: 'Constraints' },
    { id: 'n-selection', kind: 'TOPIC', order: 2, parentId: 'n-root', title: 'Selection' },
    { id: 'n-idea-1', kind: 'IDEA', parentId: 'n-directions', title: 'Gamified checklist' },
    {
      id: 'n-idea-2',
      kind: 'IDEA',
      parentId: 'n-directions',
      title: 'Concierge onboarding call',
    },
    {
      id: 'n-idea-3',
      kind: 'IDEA',
      parentId: 'n-directions',
      title: 'AI-generated sample workspace',
    },
  ]);

  const outcomes: MeetingOutcome[] = [
    {
      id: 'oc-1',
      kind: 'CANDIDATE_IDEA',
      markedAt: '2026-08-29T10:20:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-idea-1',
      origin: 'LIVE',
    },
    {
      id: 'oc-2',
      kind: 'CANDIDATE_IDEA',
      markedAt: '2026-08-29T10:50:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-idea-2',
      origin: 'LIVE',
    },
  ];

  return { graph, meeting, outcomes, timezone: 'Asia/Shanghai' };
}

export function retroScenario(): ReportScenario {
  const meeting = endedMeeting({
    actualAttendeeCount: 3,
    brief: {
      ...briefSnapshot,
      assumptions: [],
      objective: 'Retro: the failed 2.4 release',
      unknowns: [],
    },
    mode: 'RETRO',
    title: 'Release 2.4 retro',
  });

  const graph = buildGraph(meeting.id, [
    { id: 'n-root', kind: 'OBJECTIVE', title: 'Retro: the failed 2.4 release' },
    {
      id: 'n-expected',
      kind: 'TOPIC',
      order: 0,
      parentId: 'n-root',
      title: 'Expected vs actual',
    },
    { id: 'n-causes', kind: 'TOPIC', order: 1, parentId: 'n-root', title: 'Causes' },
    { id: 'n-improvements', kind: 'TOPIC', order: 2, parentId: 'n-root', title: 'Improvements' },
    { id: 'n-insight-1', kind: 'INSIGHT', parentId: 'n-causes', title: 'Load test was skipped' },
    {
      id: 'n-action-1',
      kind: 'ACTION',
      parentId: 'n-insight-1',
      title: 'Add load-test gate to CI',
    },
    {
      id: 'n-insight-2',
      kind: 'INSIGHT',
      parentId: 'n-causes',
      title: 'Alert fatigue hid the first signal',
    },
  ]);

  const outcomes: MeetingOutcome[] = [
    {
      id: 'oc-1',
      kind: 'INSIGHT',
      markedAt: '2026-08-29T10:30:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-insight-1',
      origin: 'LIVE',
    },
    {
      id: 'oc-2',
      kind: 'ACTION',
      markedAt: '2026-08-29T10:45:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-action-1',
      origin: 'LIVE',
    },
    {
      id: 'oc-3',
      kind: 'INSIGHT',
      meetingId: meeting.id,
      nodeId: 'n-insight-2',
      origin: 'POST_MEETING',
    },
  ];

  return { graph, meeting, outcomes, timezone: 'Asia/Shanghai' };
}

export function generalScenario(): ReportScenario {
  const meeting = endedMeeting({
    actualAttendeeCount: 2,
    brief: {
      ...briefSnapshot,
      assumptions: [],
      objective: 'Align the weekly sync',
      unknowns: ['Who owns the agenda next week'],
    },
    mode: 'GENERAL',
    title: 'Weekly sync alignment',
  });

  const graph = buildGraph(meeting.id, [
    { id: 'n-root', kind: 'OBJECTIVE', title: 'Align the weekly sync' },
    { id: 'n-status', kind: 'TOPIC', order: 0, parentId: 'n-root', title: 'Status round' },
    { id: 'n-blockers', kind: 'TOPIC', order: 1, parentId: 'n-root', title: 'Blockers' },
    { id: 'n-planning', kind: 'TOPIC', order: 2, parentId: 'n-root', title: 'Planning' },
    {
      id: 'n-note-1',
      kind: 'NOTE',
      parentId: 'n-blockers',
      title: 'Move release notes to async',
    },
    { id: 'n-parking-1', kind: 'PARKING', parentId: 'n-root', title: 'Office seating plan' },
  ]);

  const outcomes: MeetingOutcome[] = [
    {
      id: 'oc-1',
      kind: 'ACTION',
      markedAt: '2026-08-29T10:25:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-note-1',
      origin: 'LIVE',
      owner: 'Riley',
    },
  ];

  return { graph, meeting, outcomes, timezone: 'Asia/Shanghai' };
}

export function noOutcomeScenario(): ReportScenario {
  const base = generalScenario();
  return {
    ...base,
    outcomes: [],
  };
}

/** Chinese node titles: the product's primary content language. */
export function cjkScenario(): ReportScenario {
  const meeting = endedMeeting({
    brief: {
      ...briefSnapshot,
      assumptions: [],
      objective: '选择发布方案',
      unknowns: ['法务终审日期'],
    },
    contentLocale: 'zh-CN',
    mode: 'DECISION',
    title: '发布决策会',
  });

  const graph = buildGraph(meeting.id, [
    { id: 'n-root', kind: 'OBJECTIVE', title: '选择发布方案' },
    { id: 'n-options', kind: 'TOPIC', order: 0, parentId: 'n-root', title: '候选方案' },
    { id: 'n-criteria', kind: 'TOPIC', order: 1, parentId: 'n-root', title: '判断标准' },
    { id: 'n-risks', kind: 'TOPIC', order: 2, parentId: 'n-root', title: '风险' },
    { id: 'n-option-a', kind: 'OPTION', parentId: 'n-options', title: '灰度发布' },
    { id: 'n-option-b', kind: 'OPTION', parentId: 'n-options', title: '全量发布' },
    { id: 'n-risk-1', kind: 'RISK', parentId: 'n-risks', title: '数据迁移风险' },
    { id: 'n-action-1', kind: 'NOTE', parentId: 'n-criteria', title: '安排回滚演练' },
    { id: 'n-parking-1', kind: 'PARKING', parentId: 'n-root', title: '移动端范围' },
  ]);

  const outcomes: MeetingOutcome[] = [
    {
      id: 'oc-1',
      kind: 'DECISION',
      markedAt: '2026-08-29T10:15:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-option-a',
      origin: 'LIVE',
    },
    {
      dueDate: '2026-09-05',
      id: 'oc-2',
      kind: 'ACTION',
      markedAt: '2026-08-29T10:40:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-action-1',
      origin: 'LIVE',
      owner: '小李',
    },
  ];

  return { graph, meeting, outcomes, timezone: 'Asia/Shanghai' };
}

/**
 * Hostile-looking user content: quotes, pipes, angle brackets, Mermaid
 * entity bait, clock colons, semicolons, line breaks, emoji, and uncapped
 * outcome metadata. Node titles stay within the 48-grapheme tree invariant.
 */
export function hostileTextScenario(): ReportScenario {
  const meeting = endedMeeting({
    brief: {
      ...briefSnapshot,
      assumptions: [],
      objective: 'Choose the "safe" plan | <script>alert(1)</script>',
      unknowns: ['Budget "final" | <b>?</b>\nsecond line'],
    },
    mode: 'DECISION',
    title: 'Hostile "review" | <img src=x>',
  });

  const graph = buildGraph(meeting.id, [
    { id: 'n-root', kind: 'OBJECTIVE', title: 'Pick "one" | <script>alert(1)</script> 👾' },
    { id: 'n-options', kind: 'TOPIC', order: 0, parentId: 'n-root', title: 'Options #quot; bait' },
    { id: 'n-risks', kind: 'TOPIC', order: 1, parentId: 'n-root', title: 'Risks: 10:00; late' },
    { id: 'n-notes', kind: 'TOPIC', order: 2, parentId: 'n-root', title: 'Notes\nwith break' },
    {
      id: 'n-option-a',
      kind: 'OPTION',
      parentId: 'n-options',
      title: 'Plan "A" #35; #quot; <i>x</i>',
    },
    {
      id: 'n-option-b',
      kind: 'OPTION',
      parentId: 'n-options',
      title: 'Plan B | pipe & <script>alert("x")</script>',
    },
    { id: 'n-same-1', kind: 'OPTION', parentId: 'n-options', title: 'Same name' },
    { id: 'n-same-2', kind: 'OPTION', parentId: 'n-options', title: 'Same name' },
    {
      id: 'n-option-c',
      kind: 'OPTION',
      parentId: 'n-options',
      title: 'Plan C: risky "move"; now',
    },
    {
      id: 'n-risk-1',
      kind: 'RISK',
      note: 'Risk note',
      parentId: 'n-risks',
      title: 'Clock 10:00 risk; semi\nnew line 👾',
    },
  ]);

  const outcomes: MeetingOutcome[] = [
    {
      id: 'oc-1',
      kind: 'DECISION',
      markedAt: '2026-08-29T10:15:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-option-a',
      origin: 'LIVE',
    },
    {
      id: 'oc-2',
      kind: 'DECISION',
      markedAt: '2026-08-29T10:30:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-same-1',
      origin: 'LIVE',
    },
    {
      id: 'oc-2b',
      kind: 'INSIGHT',
      markedAt: '2026-08-29T10:37:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-option-c',
      origin: 'LIVE',
    },
    {
      id: 'oc-3',
      kind: 'ACTION',
      markedAt: '2026-08-29T10:45:00.000Z',
      meetingId: meeting.id,
      nodeId: 'n-same-2',
      note: 'Line1\nLine2 | <b>bold</b> "quoted" #35; [link](https://example.com)',
      origin: 'LIVE',
      owner: 'Owner "The | Pipe" <img src=x>',
    },
    {
      dueDate: '2026-09-01',
      id: 'oc-4',
      kind: 'INSIGHT',
      meetingId: meeting.id,
      nodeId: 'n-risk-1',
      origin: 'POST_MEETING',
    },
  ];

  return { graph, meeting, outcomes, timezone: 'Asia/Shanghai' };
}

/** Meeting with enough options to exceed the flowchart node budget. */
export function oversizedScenario(): ReportScenario {
  const meeting = endedMeeting({
    brief: { ...briefSnapshot, assumptions: [], objective: 'Pick a vendor', unknowns: [] },
    mode: 'DECISION',
    title: 'Vendor selection',
  });

  const specs: NodeSpec[] = [
    { id: 'n-root', kind: 'OBJECTIVE', title: 'Pick a vendor' },
    { id: 'n-options', kind: 'TOPIC', order: 0, parentId: 'n-root', title: 'Options' },
    { id: 'n-risks', kind: 'TOPIC', order: 1, parentId: 'n-root', title: 'Risks' },
    { id: 'n-next', kind: 'TOPIC', order: 2, parentId: 'n-root', title: 'Next steps' },
  ];

  const outcomes: MeetingOutcome[] = [];
  for (let index = 1; index <= 30; index += 1) {
    const padded = String(index).padStart(2, '0');
    specs.push({
      id: `n-option-${padded}`,
      kind: 'OPTION',
      parentId: 'n-options',
      title: `Vendor option ${padded}`,
    });
    outcomes.push({
      id: `oc-${padded}`,
      kind: index % 5 === 0 ? 'ACTION' : 'DECISION',
      markedAt: new Date(Date.parse('2026-08-29T10:00:00.000Z') + index * 120_000).toISOString(),
      meetingId: meeting.id,
      nodeId: `n-option-${padded}`,
      origin: 'LIVE',
    });
  }

  return { graph: buildGraph(meeting.id, specs), meeting, outcomes, timezone: 'Asia/Shanghai' };
}
