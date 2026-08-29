import { createMapReadyMeeting } from '@/fixtures/meeting';
import type { MeetingAggregate } from '@/modules/meeting-db';
import type { Meeting, MeetingOutcome } from '@/modules/meeting-domain';
import type { MindMapEdge, MindMapNode } from '@/modules/mind-map-domain';

const startedAt = '2026-08-29T10:00:00.000Z';
const updatedAt = '2026-08-29T10:30:00.000Z';

function node(
  id: string,
  kind: MindMapNode['kind'],
  title: string,
  position: MindMapNode['position'],
): MindMapNode {
  return {
    createdAt: startedAt,
    id,
    kind,
    meetingId: 'meeting-1',
    position,
    source: 'USER',
    title,
    updatedAt,
  };
}

const nodes: MindMapNode[] = [
  node('root', 'OBJECTIVE', 'Choose the launch plan', { x: 0, y: 120 }),
  {
    ...node('topic-options', 'TOPIC', 'Compare options', { x: 260, y: 0 }),
    topicPrompt: 'Which option best fits the goal?',
    transitionHint: 'Move from options to decision criteria.',
  },
  {
    ...node('topic-criteria', 'TOPIC', 'Agree on criteria', { x: 260, y: 120 }),
    topicPrompt: 'What must the winning option achieve?',
    transitionHint: 'Use the criteria to make the call.',
  },
  {
    ...node('topic-risks', 'TOPIC', 'Surface risks', { x: 260, y: 240 }),
    topicPrompt: 'What could make this decision fail?',
    transitionHint: 'Close with owners and next steps.',
  },
  node('parking-budget', 'PARKING', 'Budget confirmation', { x: 520, y: 240 }),
];

const edges: MindMapEdge[] = [
  {
    id: 'edge-options',
    kind: 'CONTAINS',
    meetingId: 'meeting-1',
    order: 0,
    sourceNodeId: 'root',
    targetNodeId: 'topic-options',
  },
  {
    id: 'edge-criteria',
    kind: 'CONTAINS',
    meetingId: 'meeting-1',
    order: 1,
    sourceNodeId: 'root',
    targetNodeId: 'topic-criteria',
  },
  {
    id: 'edge-risks',
    kind: 'CONTAINS',
    meetingId: 'meeting-1',
    order: 2,
    sourceNodeId: 'root',
    targetNodeId: 'topic-risks',
  },
  {
    id: 'edge-parking',
    kind: 'CONTAINS',
    meetingId: 'meeting-1',
    sourceNodeId: 'topic-risks',
    targetNodeId: 'parking-budget',
  },
];

const outcomes: MeetingOutcome[] = [
  {
    id: 'outcome-decision',
    kind: 'DECISION',
    markedAt: '2026-08-29T10:15:00.000Z',
    meetingId: 'meeting-1',
    nodeId: 'topic-options',
    origin: 'LIVE',
  },
  {
    id: 'outcome-action',
    kind: 'ACTION',
    markedAt: '2026-08-29T10:25:00.000Z',
    meetingId: 'meeting-1',
    nodeId: 'topic-criteria',
    origin: 'LIVE',
  },
];

export interface LiveMeetingFixtureOverrides {
  meeting?: Omit<Partial<Meeting>, 'id'>;
  outcomes?: MeetingOutcome[];
}

/** Stable aggregate seam for the Issue #8 canvas and Issue #10 controls. */
export function createLiveMeetingFixture(
  overrides: LiveMeetingFixtureOverrides = {},
): MeetingAggregate {
  return {
    edges: structuredClone(edges),
    grillTurns: [],
    meeting: createMapReadyMeeting({
      activeTopicNodeId: 'topic-options',
      actualAttendeeCount: 4,
      startedAt,
      status: 'LIVE',
      updatedAt,
      ...overrides.meeting,
    }),
    nodes: structuredClone(nodes),
    outcomes: structuredClone(overrides.outcomes ?? outcomes),
  };
}
