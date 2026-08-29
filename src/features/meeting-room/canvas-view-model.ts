import { MarkerType, Position } from '@xyflow/react';

import type { MeetingAggregate } from '@/modules/meeting-db';
import { subtreeNodeIds, validateTree } from '@/modules/mind-map-domain';
import type { MeetingGraph, NodeKind } from '@/modules/mind-map-domain';
import { meetingNodeSize } from '@/modules/mind-map-layout';

import type { MeetingCanvasEdge, MeetingCanvasNode } from './canvas-elements';

export interface CanvasLabels {
  activeTopic: string;
  nodeKinds: Record<NodeKind, string>;
  outcome: string;
}

export interface CanvasElements {
  activeBranchNodeIds: Set<string>;
  edges: MeetingCanvasEdge[];
  nodes: MeetingCanvasNode[];
  rootNodeId: string;
}

export function meetingGraph(aggregate: MeetingAggregate): MeetingGraph {
  return {
    edges: aggregate.edges.map((edge) => ({ ...edge })),
    meetingId: aggregate.meeting.id,
    nodes: aggregate.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
    })),
  };
}

export function buildCanvasElements(
  aggregate: MeetingAggregate,
  labels: CanvasLabels,
  selectedNodeId?: string,
): CanvasElements {
  const graph = meetingGraph(aggregate);
  const validation = validateTree(graph);
  if (!validation.ok) throw new Error(validation.error.code);

  const activeTopicNodeId = aggregate.meeting.activeTopicNodeId;
  const activeSubtree =
    activeTopicNodeId === undefined ? undefined : subtreeNodeIds(graph, activeTopicNodeId);
  if (activeSubtree !== undefined && !activeSubtree.ok) {
    throw new Error(activeSubtree.error.code);
  }
  const activeBranchNodeIds = new Set(activeSubtree?.ok ? activeSubtree.value : []);
  activeBranchNodeIds.add(validation.value.rootNodeId);
  const outcomeNodeIds = new Set(aggregate.outcomes.map((outcome) => outcome.nodeId));

  return {
    activeBranchNodeIds,
    edges: aggregate.edges.map((edge) => ({
      animated: false,
      data: {
        dimmed:
          activeTopicNodeId !== undefined &&
          (!activeBranchNodeIds.has(edge.sourceNodeId) ||
            !activeBranchNodeIds.has(edge.targetNodeId)),
      },
      id: edge.id,
      markerEnd: { color: 'var(--color-border)', type: MarkerType.ArrowClosed },
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: 'meetingEdge',
    })),
    nodes: aggregate.nodes.map((node) => {
      const isActiveTopic = node.id === activeTopicNodeId;
      const dimmed = activeTopicNodeId !== undefined && !activeBranchNodeIds.has(node.id);
      return {
        ariaLabel: `${labels.nodeKinds[node.kind]}: ${node.title}${isActiveTopic ? `, ${labels.activeTopic}` : ''}${outcomeNodeIds.has(node.id) ? `, ${labels.outcome}` : ''}`,
        data: {
          activeLabel: labels.activeTopic,
          dimmed,
          isActiveTopic,
          isOutcome: outcomeNodeIds.has(node.id),
          kindLabel: labels.nodeKinds[node.kind],
          outcomeLabel: labels.outcome,
          title: node.title,
        },
        draggable: aggregate.meeting.status !== 'ENDED',
        focusable: true,
        id: node.id,
        position: { ...node.position },
        selectable: true,
        selected: node.id === selectedNodeId,
        sourcePosition: Position.Right,
        style: meetingNodeSize,
        targetPosition: Position.Left,
        type: 'meetingNode' as const,
        zIndex: isActiveTopic || node.id === selectedNodeId ? 2 : 1,
      };
    }),
    rootNodeId: validation.value.rootNodeId,
  };
}

export function currentParentId(aggregate: MeetingAggregate, nodeId: string): string | undefined {
  return aggregate.edges.find((edge) => edge.targetNodeId === nodeId)?.sourceNodeId;
}

export function allowedParentIds(aggregate: MeetingAggregate, nodeId: string): string[] {
  const graph = meetingGraph(aggregate);
  const subtree = subtreeNodeIds(graph, nodeId);
  if (!subtree.ok) return [];
  const excluded = new Set(subtree.value);
  return aggregate.nodes.filter((node) => !excluded.has(node.id)).map((node) => node.id);
}

export function subtreeSize(aggregate: MeetingAggregate, nodeId: string): number {
  const subtree = subtreeNodeIds(meetingGraph(aggregate), nodeId);
  return subtree.ok ? subtree.value.length : 0;
}
