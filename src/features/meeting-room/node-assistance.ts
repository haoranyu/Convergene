import type { MeetingAggregate } from '@/modules/meeting-db';
import {
  expandNodeInputSchema,
  expandNodeOutputSchema,
  type ExpandNodeChild,
  type ExpandNodeContext,
  type ExpandNodeInput,
} from '@/modules/meeting-ai/expand-node';
import {
  validateTree,
  type ExpansionChild,
  type MindMapNode,
  type StrategyId,
} from '@/modules/mind-map-domain';

const maximumBriefSummaryLength = 1_200;
const maximumBriefFieldLength = maximumBriefSummaryLength / 2;
const maximumNeighborCount = 8;
const maximumNoteSummaryLength = 160;

function contextForNode(node: MindMapNode, includeNote = false): ExpandNodeContext {
  const note = includeNote ? node.note?.trim().slice(0, maximumNoteSummaryLength) : undefined;
  return {
    id: node.id,
    kind: node.kind,
    ...(note ? { note } : {}),
    title: node.title,
  };
}

function briefSummary(aggregate: MeetingAggregate): string {
  const brief = aggregate.meeting.brief;
  if (brief === undefined) throw new Error('BRIEF_NOT_CONFIRMED');
  return [brief.objective, brief.desiredOutcome]
    .map((value) => value.trim().slice(0, maximumBriefFieldLength))
    .filter(Boolean)
    .join('\n')
    .slice(0, maximumBriefSummaryLength);
}

export function buildExpandNodeInput(
  aggregate: MeetingAggregate,
  selectedNodeId: string,
  strategyId: StrategyId,
): ExpandNodeInput {
  const mode = aggregate.meeting.mode;
  if (mode === undefined) throw new Error('MEETING_MODE_REQUIRED');
  const selectedNode = aggregate.nodes.find((node) => node.id === selectedNodeId);
  if (selectedNode === undefined) throw new Error('NODE_NOT_FOUND');

  const incomingEdge = aggregate.edges.find((edge) => edge.targetNodeId === selectedNodeId);
  const parent = aggregate.nodes.find((node) => node.id === incomingEdge?.sourceNodeId);
  const children = aggregate.edges
    .filter((edge) => edge.sourceNodeId === selectedNodeId)
    .slice(0, maximumNeighborCount)
    .map((edge) => aggregate.nodes.find((node) => node.id === edge.targetNodeId))
    .filter((node): node is MindMapNode => node !== undefined)
    .map((node) => contextForNode(node));
  const siblings =
    incomingEdge === undefined
      ? []
      : aggregate.edges
          .filter(
            (edge) =>
              edge.sourceNodeId === incomingEdge.sourceNodeId &&
              edge.targetNodeId !== selectedNodeId,
          )
          .slice(0, maximumNeighborCount)
          .map((edge) => aggregate.nodes.find((node) => node.id === edge.targetNodeId))
          .filter((node): node is MindMapNode => node !== undefined)
          .map((node) => contextForNode(node));

  return expandNodeInputSchema.parse({
    briefSummary: briefSummary(aggregate),
    children,
    mode,
    ...(parent ? { parent: contextForNode(parent) } : {}),
    selectedNode: contextForNode(selectedNode, true),
    siblings,
    strategyId,
  });
}

interface BuildExpansionChildrenOptions {
  drafts: readonly ExpandNodeChild[];
  meetingId: string;
  parent: MindMapNode;
  strategyId: StrategyId;
  timestamp: string;
  uuid?: () => string;
}

export function buildExpansionChildren({
  drafts,
  meetingId,
  parent,
  strategyId,
  timestamp,
  uuid = () => crypto.randomUUID(),
}: BuildExpansionChildrenOptions): ExpansionChild[] {
  const validated = expandNodeOutputSchema.parse({ children: drafts }).children;
  const verticalOffset = ((validated.length - 1) * 112) / 2;
  return validated.map((draft, index) => ({
    edgeId: uuid(),
    node: {
      createdAt: timestamp,
      id: uuid(),
      kind: draft.kind,
      meetingId,
      note: draft.note,
      position: {
        x: parent.position.x + 384,
        y: parent.position.y + index * 112 - verticalOffset,
      },
      source: 'EXPANSION_AI',
      strategyId,
      title: draft.title,
      updatedAt: timestamp,
    },
  }));
}

export function quickNoteParent(aggregate: MeetingAggregate): {
  fallbackToRoot: boolean;
  parentNodeId: string;
} {
  if (aggregate.meeting.activeTopicNodeId !== undefined) {
    return { fallbackToRoot: false, parentNodeId: aggregate.meeting.activeTopicNodeId };
  }
  const graph = {
    edges: aggregate.edges,
    meetingId: aggregate.meeting.id,
    nodes: aggregate.nodes,
  };
  const validation = validateTree(graph);
  if (!validation.ok) throw new Error(validation.error.code);
  return { fallbackToRoot: true, parentNodeId: validation.value.rootNodeId };
}
