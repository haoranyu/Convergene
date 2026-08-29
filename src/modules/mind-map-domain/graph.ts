import type { Result } from '@/modules/shared';
import { isCanonicalUtcTimestamp } from '@/modules/shared';

import type {
  ExpansionChild,
  GraphErrorCode,
  GraphSummary,
  MeetingGraph,
  MindMapEdge,
  MindMapNode,
} from './model';
import { nodeKinds, strategyIds } from './model';

function failure(code: GraphErrorCode, message?: string): Result<never, GraphErrorCode> {
  return { error: { code, message }, ok: false };
}

function graphemeCount(value: string): number {
  const Segmenter = Intl.Segmenter;
  return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length;
}

function duplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function rootTopicEdges(graph: MeetingGraph, rootNodeId: string): MindMapEdge[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges.filter(
    (edge) =>
      edge.sourceNodeId === rootNodeId && nodesById.get(edge.targetNodeId)?.kind === 'TOPIC',
  );
}

export function validateTree(graph: MeetingGraph): Result<GraphSummary, GraphErrorCode> {
  if (
    typeof graph.meetingId !== 'string' ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.some(
      (node) =>
        node === null ||
        typeof node !== 'object' ||
        typeof node.id !== 'string' ||
        typeof node.meetingId !== 'string' ||
        typeof node.title !== 'string',
    ) ||
    graph.edges.some(
      (edge) =>
        edge === null ||
        typeof edge !== 'object' ||
        typeof edge.id !== 'string' ||
        typeof edge.meetingId !== 'string' ||
        typeof edge.sourceNodeId !== 'string' ||
        typeof edge.targetNodeId !== 'string',
    )
  ) {
    return failure('INVALID_IDENTIFIER');
  }

  if (
    graph.meetingId.trim() === '' ||
    graph.nodes.some((node) => node.id.trim() === '') ||
    graph.edges.some((edge) => edge.id.trim() === '')
  ) {
    return failure('INVALID_IDENTIFIER');
  }

  if (
    graph.nodes.some((node) => node.meetingId !== graph.meetingId) ||
    graph.edges.some((edge) => edge.meetingId !== graph.meetingId)
  ) {
    return failure('INVALID_MEETING_MEMBERSHIP');
  }

  if (duplicates(graph.nodes.map((node) => node.id))) {
    return failure('DUPLICATE_NODE_ID');
  }

  if (duplicates(graph.edges.map((edge) => edge.id))) {
    return failure('DUPLICATE_EDGE_ID');
  }

  if (
    graph.nodes.some((node) => node.title.trim() === '' || graphemeCount(node.title.trim()) > 48)
  ) {
    return failure('INVALID_TITLE');
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  if (
    graph.nodes.some(
      (node) =>
        !nodeKinds.includes(node.kind) ||
        (node.source !== 'USER' &&
          node.source !== 'INITIAL_AI' &&
          node.source !== 'EXPANSION_AI' &&
          node.source !== 'QUICK_NOTE') ||
        (node.note !== undefined && typeof node.note !== 'string') ||
        (node.topicPrompt !== undefined && typeof node.topicPrompt !== 'string') ||
        (node.transitionHint !== undefined && typeof node.transitionHint !== 'string') ||
        node.position === null ||
        typeof node.position !== 'object',
    )
  ) {
    return failure('INVALID_NODE');
  }

  if (
    graph.nodes.some(
      (node) => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y),
    )
  ) {
    return failure('INVALID_POSITION');
  }

  if (
    graph.nodes.some(
      (node) => node.strategyId !== undefined && !strategyIds.includes(node.strategyId),
    )
  ) {
    return failure('INVALID_STRATEGY');
  }

  if (
    graph.nodes.some(
      (node) =>
        !isCanonicalUtcTimestamp(node.createdAt) ||
        !isCanonicalUtcTimestamp(node.updatedAt) ||
        Date.parse(node.updatedAt) < Date.parse(node.createdAt),
    )
  ) {
    return failure('INVALID_TIMESTAMP');
  }

  if (
    graph.nodes.some((node) => {
      const suggestion = node.parentSuggestion;
      if (suggestion === undefined) return false;
      if (
        suggestion === null ||
        typeof suggestion !== 'object' ||
        typeof suggestion.recommendedParentNodeId !== 'string' ||
        !Array.isArray(suggestion.alternativeParentNodeIds) ||
        !suggestion.alternativeParentNodeIds.every(
          (candidateId) => typeof candidateId === 'string',
        ) ||
        typeof suggestion.rationale !== 'string' ||
        typeof suggestion.createdAt !== 'string'
      ) {
        return true;
      }
      const candidates = [
        suggestion.recommendedParentNodeId,
        ...suggestion.alternativeParentNodeIds,
      ];
      return (
        suggestion.rationale.trim() === '' ||
        !isCanonicalUtcTimestamp(suggestion.createdAt) ||
        Date.parse(suggestion.createdAt) < Date.parse(node.createdAt) ||
        Date.parse(suggestion.createdAt) > Date.parse(node.updatedAt) ||
        suggestion.alternativeParentNodeIds.length > 2 ||
        duplicates(candidates) ||
        candidates.some(
          (candidateId) =>
            candidateId === node.id || nodesById.get(candidateId)?.meetingId !== graph.meetingId,
        )
      );
    })
  ) {
    return failure('INVALID_PARENT_SUGGESTION');
  }

  if (
    graph.edges.some(
      (edge) =>
        edge.kind !== 'CONTAINS' ||
        (edge.order !== undefined && (!Number.isInteger(edge.order) || edge.order < 0)) ||
        edge.sourceNodeId === edge.targetNodeId ||
        !nodesById.has(edge.sourceNodeId) ||
        !nodesById.has(edge.targetNodeId),
    )
  ) {
    return failure('INVALID_EDGE');
  }

  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
    children.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  const roots = graph.nodes.filter((node) => incoming.get(node.id) === 0);

  if (roots.length !== 1) {
    return failure('ROOT_COUNT');
  }

  const [root] = roots;

  if (root === undefined || root.kind !== 'OBJECTIVE') {
    return failure('ROOT_KIND');
  }

  if (graph.nodes.filter((node) => node.kind === 'OBJECTIVE').length !== 1) {
    return failure('ROOT_KIND');
  }

  if (graph.nodes.some((node) => node.id !== root.id && incoming.get(node.id) !== 1)) {
    return failure('PARENT_COUNT');
  }

  const colors = new Map<string, 'visiting' | 'visited'>();
  let hasCycle = false;

  function visit(nodeId: string): void {
    if (colors.get(nodeId) === 'visiting') {
      hasCycle = true;
      return;
    }

    if (colors.get(nodeId) === 'visited') {
      return;
    }

    colors.set(nodeId, 'visiting');
    for (const childId of children.get(nodeId) ?? []) {
      visit(childId);
    }
    colors.set(nodeId, 'visited');
  }

  for (const node of graph.nodes) {
    visit(node.id);
  }

  if (hasCycle) {
    return failure('CYCLE');
  }

  const depthById = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined) break;
    const depth = depthById.get(nodeId) ?? 0;
    for (const childId of children.get(nodeId) ?? []) {
      depthById.set(childId, depth + 1);
      queue.push(childId);
    }
  }

  if (depthById.size !== graph.nodes.length) {
    return failure('DISCONNECTED_GRAPH');
  }

  const topicEdges = rootTopicEdges(graph, root.id);
  const topicNodes = topicEdges.map((edge) => nodesById.get(edge.targetNodeId));

  if (
    topicNodes.some(
      (node) =>
        node?.topicPrompt === undefined ||
        node.topicPrompt.trim() === '' ||
        node.transitionHint === undefined ||
        node.transitionHint.trim() === '',
    )
  ) {
    return failure('INVALID_TOPIC');
  }

  const orders = topicEdges.map((edge) => edge.order);
  const sortedOrders = [...orders].sort((left, right) => (left ?? -1) - (right ?? -1));

  if (
    orders.some((order) => order === undefined || !Number.isInteger(order) || order < 0) ||
    duplicates(orders.map(String)) ||
    sortedOrders.some((order, index) => order !== index)
  ) {
    return failure('INVALID_TOPIC_ORDER');
  }

  return {
    ok: true,
    value: {
      depth: Math.max(...depthById.values()),
      rootNodeId: root.id,
      topicNodeIds: [...topicEdges]
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        .map((edge) => edge.targetNodeId),
    },
  };
}

export function validateInitialMap(graph: MeetingGraph): Result<GraphSummary, GraphErrorCode> {
  const tree = validateTree(graph);

  if (!tree.ok) return tree;

  if (graph.nodes.length > 12) {
    return failure('INITIAL_NODE_COUNT');
  }

  if (tree.value.depth > 2) {
    return failure('INITIAL_DEPTH');
  }

  if (tree.value.topicNodeIds.length < 3 || tree.value.topicNodeIds.length > 5) {
    return failure('INITIAL_TOPIC_COUNT');
  }

  const rootChildCount = graph.edges.filter(
    (edge) => edge.sourceNodeId === tree.value.rootNodeId,
  ).length;

  if (rootChildCount !== tree.value.topicNodeIds.length) {
    return failure('INVALID_TOPIC');
  }

  return tree;
}

export function applyExpansion(
  graph: MeetingGraph,
  parentNodeId: string,
  children: readonly ExpansionChild[],
): Result<MeetingGraph, GraphErrorCode> {
  const currentTree = validateTree(graph);
  if (!currentTree.ok) return currentTree;

  if (!graph.nodes.some((node) => node.id === parentNodeId)) {
    return failure('NODE_NOT_FOUND');
  }

  if (children.length < 2 || children.length > 4) {
    return failure('EXPANSION_COUNT');
  }

  const existingNodeIds = new Set(graph.nodes.map((node) => node.id));
  const existingEdgeIds = new Set(graph.edges.map((edge) => edge.id));

  if (
    children.some(
      ({ edgeId, node }) =>
        node.meetingId !== graph.meetingId ||
        node.source !== 'EXPANSION_AI' ||
        node.strategyId === undefined ||
        existingNodeIds.has(node.id) ||
        existingEdgeIds.has(edgeId),
    ) ||
    duplicates(children.map(({ node }) => node.id)) ||
    duplicates(children.map(({ edgeId }) => edgeId))
  ) {
    return failure('INVALID_EXPANSION');
  }

  const expanded: MeetingGraph = {
    ...graph,
    edges: [
      ...graph.edges,
      ...children.map(({ edgeId, node, order }) => ({
        id: edgeId,
        kind: 'CONTAINS' as const,
        meetingId: graph.meetingId,
        order,
        sourceNodeId: parentNodeId,
        targetNodeId: node.id,
      })),
    ],
    nodes: [...graph.nodes, ...children.map(({ node }) => node)],
  };

  const validation = validateTree(expanded);
  return validation.ok ? { ok: true, value: expanded } : validation;
}

export function reparentNode(
  graph: MeetingGraph,
  nodeId: string,
  parentNodeId: string,
): Result<MeetingGraph, GraphErrorCode> {
  const tree = validateTree(graph);
  if (!tree.ok) return tree;

  if (nodeId === tree.value.rootNodeId || nodeId === parentNodeId) {
    return failure('INVALID_REPARENT');
  }

  if (
    !graph.nodes.some((node) => node.id === nodeId) ||
    !graph.nodes.some((node) => node.id === parentNodeId)
  ) {
    return failure('NODE_NOT_FOUND');
  }

  const incomingEdge = graph.edges.find((edge) => edge.targetNodeId === nodeId);
  if (incomingEdge === undefined) return failure('INVALID_REPARENT');

  const movedEdges = graph.edges.map((edge) =>
    edge.id === incomingEdge.id ? { ...edge, sourceNodeId: parentNodeId } : edge,
  );
  const rootEdges = rootTopicEdges({ ...graph, edges: movedEdges }, tree.value.rootNodeId).sort(
    (left, right) =>
      (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id),
  );
  const rootOrder = new Map(rootEdges.map((edge, index) => [edge.id, index]));
  const reparented: MeetingGraph = {
    ...graph,
    edges: movedEdges.map((edge) =>
      rootOrder.has(edge.id)
        ? { ...edge, order: rootOrder.get(edge.id) }
        : edge.id === incomingEdge.id
          ? { ...edge, order: undefined }
          : edge,
    ),
  };

  const validation = validateTree(reparented);
  return validation.ok ? { ok: true, value: reparented } : validation;
}

export function insertNode(
  graph: MeetingGraph,
  parentNodeId: string,
  node: MindMapNode,
  edgeId: string,
): Result<MeetingGraph, GraphErrorCode> {
  const tree = validateTree(graph);
  if (!tree.ok) return tree;
  if (
    edgeId.trim() === '' ||
    graph.edges.some((edge) => edge.id === edgeId) ||
    graph.nodes.some((candidate) => candidate.id === node.id) ||
    node.meetingId !== graph.meetingId ||
    (node.source !== 'USER' && node.source !== 'QUICK_NOTE') ||
    node.strategyId !== undefined
  ) {
    return failure('INVALID_INSERT');
  }

  const parent = graph.nodes.find((candidate) => candidate.id === parentNodeId);
  if (parent === undefined) return failure('NODE_NOT_FOUND');
  if (node.kind === 'TOPIC' && parentNodeId !== tree.value.rootNodeId) {
    return failure('INVALID_TOPIC');
  }

  const topicOrder =
    parentNodeId === tree.value.rootNodeId && node.kind === 'TOPIC'
      ? tree.value.topicNodeIds.length
      : undefined;
  const inserted: MeetingGraph = {
    edges: [
      ...graph.edges,
      {
        id: edgeId,
        kind: 'CONTAINS',
        meetingId: graph.meetingId,
        order: topicOrder,
        sourceNodeId: parentNodeId,
        targetNodeId: node.id,
      },
    ],
    meetingId: graph.meetingId,
    nodes: [...graph.nodes, node],
  };
  const validation = validateTree(inserted);
  return validation.ok ? { ok: true, value: inserted } : validation;
}

export function deleteSubtree(
  graph: MeetingGraph,
  nodeId: string,
): Result<MeetingGraph, GraphErrorCode> {
  const tree = validateTree(graph);
  if (!tree.ok) return tree;
  if (nodeId === tree.value.rootNodeId) return failure('INVALID_DELETE');

  const subtree = subtreeNodeIds(graph, nodeId);
  if (!subtree.ok) return subtree;
  const removedIds = new Set(subtree.value);
  const remainingNodes = graph.nodes.filter((node) => !removedIds.has(node.id));
  const remainingEdges = graph.edges.filter(
    (edge) => !removedIds.has(edge.sourceNodeId) && !removedIds.has(edge.targetNodeId),
  );
  const remainingRootTopicEdges = remainingEdges
    .filter(
      (edge) =>
        edge.sourceNodeId === tree.value.rootNodeId &&
        remainingNodes.find((node) => node.id === edge.targetNodeId)?.kind === 'TOPIC',
    )
    .sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
    );
  const topicOrder = new Map(remainingRootTopicEdges.map((edge, index) => [edge.id, index]));
  const value: MeetingGraph = {
    edges: remainingEdges.map((edge) =>
      topicOrder.has(edge.id) ? { ...edge, order: topicOrder.get(edge.id) } : { ...edge },
    ),
    meetingId: graph.meetingId,
    nodes: remainingNodes,
  };

  const validation = validateTree(value);
  return validation.ok ? { ok: true, value } : validation;
}

export function orderedTopicIds(graph: MeetingGraph): Result<string[], GraphErrorCode> {
  const validation = validateTree(graph);
  return validation.ok ? { ok: true, value: validation.value.topicNodeIds } : validation;
}

export function subtreeNodeIds(
  graph: MeetingGraph,
  subtreeRootId: string,
): Result<string[], GraphErrorCode> {
  const validation = validateTree(graph);
  if (!validation.ok) return validation;

  if (!graph.nodes.some((node) => node.id === subtreeRootId)) {
    return failure('NODE_NOT_FOUND');
  }

  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) children.get(edge.sourceNodeId)?.push(edge.targetNodeId);

  const result: string[] = [];
  const queue = [subtreeRootId];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined) break;
    result.push(nodeId);
    queue.push(...(children.get(nodeId) ?? []));
  }

  return { ok: true, value: result };
}
