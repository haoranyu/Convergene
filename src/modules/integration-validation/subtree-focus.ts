import { getNodesBounds, getViewportForBounds } from '@xyflow/react';

import type { IntegrationLayoutEdge, PositionedIntegrationNode } from './dagre-layout';

export interface SubtreeFocusResult {
  bounds: { height: number; width: number; x: number; y: number };
  nodeIds: string[];
  viewport: { x: number; y: number; zoom: number };
}

export interface SubtreeFocusOptions {
  height: number;
  maxZoom?: number;
  minZoom?: number;
  padding?: number;
  width: number;
}

export function calculateSubtreeFocus(
  nodes: PositionedIntegrationNode[],
  edges: IntegrationLayoutEdge[],
  rootNodeId: string,
  options: SubtreeFocusOptions,
): SubtreeFocusResult {
  if (options.width <= 0 || options.height <= 0) {
    throw new Error('Viewport dimensions must be positive');
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  if (!nodesById.has(rootNodeId)) {
    throw new Error(`Cannot focus missing subtree root ${rootNodeId}`);
  }

  const childrenBySource = new Map<string, string[]>();
  for (const edge of edges) {
    const children = childrenBySource.get(edge.source) ?? [];
    children.push(edge.target);
    childrenBySource.set(edge.source, children);
  }

  const nodeIds: string[] = [];
  const pendingNodeIds = [rootNodeId];
  const visitedNodeIds = new Set<string>();

  while (pendingNodeIds.length > 0) {
    const nodeId = pendingNodeIds.shift()!;
    if (visitedNodeIds.has(nodeId)) {
      continue;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      throw new Error(`Subtree edge references missing node ${nodeId}`);
    }

    visitedNodeIds.add(nodeId);
    nodeIds.push(nodeId);
    pendingNodeIds.push(...(childrenBySource.get(nodeId) ?? []));
  }

  const bounds = getNodesBounds(
    nodeIds.map((nodeId) => {
      const node = nodesById.get(nodeId)!;
      return {
        data: {},
        height: node.height,
        id: node.id,
        position: node.position,
        width: node.width,
      };
    }),
  );

  return {
    bounds,
    nodeIds,
    viewport: getViewportForBounds(
      bounds,
      options.width,
      options.height,
      options.minZoom ?? 0.5,
      options.maxZoom ?? 1.5,
      options.padding ?? 0.12,
    ),
  };
}
