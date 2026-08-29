import {
  longEnglishMeetingTreeEdges,
  longEnglishMeetingTreeNodes,
} from '@/fixtures/integration-validation/long-english-meeting-tree';
import { briefSnapshot, createMapReadyMeeting } from '@/fixtures/meeting';
import type { MeetingAggregate } from '@/modules/meeting-db';
import type { MeetingOutcome } from '@/modules/meeting-domain';
import type { MindMapEdge, MindMapNode, NodeKind } from '@/modules/mind-map-domain';
import { layoutMeetingGraph } from '@/modules/mind-map-layout';

const meetingId = 'meeting-canvas-browser-fixture';
const timestamp = '2026-08-29T10:00:00.000Z';

function kindForNode(id: string): NodeKind {
  if (id === 'objective') return 'OBJECTIVE';
  if (id.startsWith('topic-')) return 'TOPIC';
  if (id.startsWith('option-')) return 'OPTION';
  if (id.startsWith('risk-')) return 'RISK';
  if (id.startsWith('criteria-')) return 'INSIGHT';
  return 'NOTE';
}

function graphNodes(): MindMapNode[] {
  return longEnglishMeetingTreeNodes.map((node) => {
    const kind = kindForNode(node.id);
    return {
      createdAt: timestamp,
      id: node.id,
      kind,
      meetingId,
      position: { x: 0, y: 0 },
      source: 'INITIAL_AI',
      title: node.title,
      ...(kind === 'TOPIC'
        ? {
            topicPrompt: `Open ${node.title}`,
            transitionHint: `Move to ${node.title}`,
          }
        : {}),
      updatedAt: timestamp,
    };
  });
}

function graphEdges(): MindMapEdge[] {
  return longEnglishMeetingTreeEdges.map((edge) => ({
    id: edge.id,
    kind: 'CONTAINS',
    meetingId,
    order: edge.order,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
  }));
}

const outcome: MeetingOutcome = {
  id: 'outcome-guided',
  kind: 'DECISION',
  markedAt: timestamp,
  meetingId,
  nodeId: 'option-guided',
  origin: 'LIVE',
};

export function createMeetingCanvasTestFixture(): MeetingAggregate {
  const layout = layoutMeetingGraph({
    edges: graphEdges(),
    meetingId,
    nodes: graphNodes(),
  });
  if (!layout.ok) throw new Error(`Invalid meeting canvas test fixture: ${layout.error.code}`);

  return {
    edges: structuredClone(layout.value.edges),
    grillTurns: [],
    meeting: createMapReadyMeeting({
      activeTopicNodeId: 'topic-audience',
      brief: briefSnapshot,
      id: meetingId,
      mode: 'DECISION',
      startedAt: timestamp,
      status: 'LIVE',
      title: 'Choose a reliable launch approach',
      updatedAt: timestamp,
    }),
    nodes: structuredClone(layout.value.nodes),
    outcomes: [structuredClone(outcome)],
  };
}
