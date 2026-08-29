import dagre from '@dagrejs/dagre';

import { isCanonicalUtcTimestamp, type Result } from '@/modules/shared';
import { validateTree } from '@/modules/mind-map-domain';
import type { GraphErrorCode, MeetingGraph } from '@/modules/mind-map-domain';

export const meetingNodeSize = { height: 88, width: 288 } as const;

export interface LayoutNode {
  height: number;
  id: string;
  title: string;
  width: number;
}

export interface LayoutEdge {
  id: string;
  order?: number;
  source: string;
  target: string;
}

export interface PositionedLayoutNode extends LayoutNode {
  position: { x: number; y: number };
}

export interface LeftToRightLayout {
  edges: LayoutEdge[];
  height: number;
  nodes: PositionedLayoutNode[];
  width: number;
}

export type LayoutErrorCode = GraphErrorCode | 'LAYOUT_FAILED';

function failure(code: LayoutErrorCode): Result<never, LayoutErrorCode> {
  return { error: { code }, ok: false };
}

export function createLeftToRightLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
): LeftToRightLayout {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    marginx: 24,
    marginy: 24,
    nodesep: 56,
    rankdir: 'LR',
    ranksep: 96,
  });

  for (const node of nodes) {
    graph.setNode(node.id, { height: node.height, width: node.width });
  }

  const edgesBySource = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    const siblings = edgesBySource.get(edge.source) ?? [];
    siblings.push(edge);
    edgesBySource.set(edge.source, siblings);
  }

  const orderedEdges = [...edgesBySource.values()].flatMap((siblings) =>
    siblings.sort(
      (left, right) =>
        (right.order ?? Number.MIN_SAFE_INTEGER) - (left.order ?? Number.MIN_SAFE_INTEGER) ||
        right.id.localeCompare(left.id),
    ),
  );

  // Dagre stacks same-rank siblings in reverse insertion order. Descending
  // domain order keeps their visual top-to-bottom order deterministic.
  for (const edge of orderedEdges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);
  const size = graph.graph();

  return {
    edges: edges.map((edge) => ({ ...edge })),
    height: size.height ?? 0,
    nodes: nodes.map((node) => {
      const positioned = graph.node(node.id) as { x: number; y: number } | undefined;
      if (positioned === undefined) {
        throw new Error(`Dagre did not position node ${node.id}`);
      }
      return {
        ...node,
        position: {
          x: positioned.x - node.width / 2,
          y: positioned.y - node.height / 2,
        },
      };
    }),
    width: size.width ?? 0,
  };
}

export function layoutMeetingGraph(
  graph: MeetingGraph,
  updatedAt?: string,
): Result<MeetingGraph, LayoutErrorCode> {
  const validation = validateTree(graph);
  if (!validation.ok) return validation;
  if (updatedAt !== undefined && !isCanonicalUtcTimestamp(updatedAt)) {
    return failure('INVALID_TIMESTAMP');
  }

  try {
    const layout = createLeftToRightLayout(
      graph.nodes.map((node) => ({ ...meetingNodeSize, id: node.id, title: node.title })),
      graph.edges.map((edge) => ({
        id: edge.id,
        order: edge.order,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
      })),
    );
    const positions = new Map(layout.nodes.map((node) => [node.id, node.position]));
    const value: MeetingGraph = {
      edges: graph.edges.map((edge) => ({ ...edge })),
      meetingId: graph.meetingId,
      nodes: graph.nodes.map((node) => ({
        ...node,
        position: { ...positions.get(node.id)! },
        updatedAt: updatedAt ?? node.updatedAt,
      })),
    };
    const positionedValidation = validateTree(value);
    return positionedValidation.ok ? { ok: true, value } : positionedValidation;
  } catch {
    return failure('LAYOUT_FAILED');
  }
}
