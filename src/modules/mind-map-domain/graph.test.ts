import { describe, expect, it } from 'vitest';

import {
  applyExpansion,
  deleteSubtree,
  insertNode,
  orderedTopicIds,
  reparentNode,
  subtreeNodeIds,
  validateInitialMap,
  validateTree,
} from './graph';
import type { MeetingGraph, MindMapEdge, MindMapNode } from './model';

const meetingId = 'meeting-1';
const createdAt = '2026-08-29T09:30:00.000Z';

function node(
  overrides: Partial<MindMapNode> & Pick<MindMapNode, 'id' | 'kind' | 'title'>,
): MindMapNode {
  return {
    createdAt,
    meetingId,
    position: { x: 0, y: 0 },
    source: 'INITIAL_AI',
    updatedAt: createdAt,
    ...overrides,
  };
}

function edge(id: string, sourceNodeId: string, targetNodeId: string, order?: number): MindMapEdge {
  return { id, kind: 'CONTAINS', meetingId, order, sourceNodeId, targetNodeId };
}

function initialGraph(): MeetingGraph {
  return {
    edges: [
      edge('edge-topic-3', 'root', 'topic-3', 2),
      edge('edge-topic-1', 'root', 'topic-1', 0),
      edge('edge-topic-2', 'root', 'topic-2', 1),
      edge('edge-detail', 'topic-1', 'detail-1'),
    ],
    meetingId,
    nodes: [
      node({ id: 'root', kind: 'OBJECTIVE', title: 'Choose a launch plan' }),
      node({
        id: 'topic-1',
        kind: 'TOPIC',
        title: 'Options',
        topicPrompt: 'Which options are viable?',
        transitionHint: 'Next, compare criteria.',
      }),
      node({
        id: 'topic-2',
        kind: 'TOPIC',
        title: 'Criteria',
        topicPrompt: 'What matters most?',
        transitionHint: 'Next, inspect risks.',
      }),
      node({
        id: 'topic-3',
        kind: 'TOPIC',
        title: 'Risks',
        topicPrompt: 'What could invalidate the choice?',
        transitionHint: 'Now close the decision.',
      }),
      node({ id: 'detail-1', kind: 'OPTION', title: 'Launch in one region' }),
    ],
  };
}

describe('meeting graph invariants', () => {
  it('accepts a controlled initial map and preserves caller array order', () => {
    const graph = initialGraph();
    const originalEdgeOrder = graph.edges.map(({ id }) => id);

    expect(validateInitialMap(graph)).toMatchObject({
      ok: true,
      value: { depth: 2, rootNodeId: 'root', topicNodeIds: ['topic-1', 'topic-2', 'topic-3'] },
    });
    expect(orderedTopicIds(graph)).toEqual({
      ok: true,
      value: ['topic-1', 'topic-2', 'topic-3'],
    });
    expect(graph.edges.map(({ id }) => id)).toEqual(originalEdgeOrder);
  });

  it('allows the P0 quick-note fallback under the objective in a general tree', () => {
    const graph = initialGraph();
    graph.nodes.push(
      node({ id: 'quick-note', kind: 'NOTE', source: 'QUICK_NOTE', title: 'Unsorted thought' }),
    );
    graph.edges.push(edge('edge-quick-note', 'root', 'quick-note'));

    expect(validateTree(graph).ok).toBe(true);
    expect(validateInitialMap(graph)).toMatchObject({
      error: { code: 'INVALID_TOPIC' },
      ok: false,
    });
  });

  it.each([
    [
      'too few topics',
      () => ({
        ...initialGraph(),
        edges: initialGraph().edges.filter((item) => item.targetNodeId !== 'topic-3'),
        nodes: initialGraph().nodes.filter((item) => item.id !== 'topic-3'),
      }),
      'INITIAL_TOPIC_COUNT',
    ],
    [
      'overlong title',
      () => ({
        ...initialGraph(),
        nodes: initialGraph().nodes.map((item) =>
          item.id === 'detail-1' ? { ...item, title: 'x'.repeat(49) } : item,
        ),
      }),
      'INVALID_TITLE',
    ],
    [
      'missing topic order',
      () => ({
        ...initialGraph(),
        edges: initialGraph().edges.map((item) =>
          item.id === 'edge-topic-2' ? { ...item, order: undefined } : item,
        ),
      }),
      'INVALID_TOPIC_ORDER',
    ],
  ] as const)('rejects an initial graph with %s', (_label, createInvalidGraph, code) => {
    expect(validateInitialMap(createInvalidGraph())).toMatchObject({ error: { code }, ok: false });
  });

  it('rejects disconnected cycles', () => {
    const graph = initialGraph();
    graph.nodes.push(
      node({ id: 'cycle-a', kind: 'NOTE', title: 'Cycle A' }),
      node({ id: 'cycle-b', kind: 'NOTE', title: 'Cycle B' }),
    );
    graph.edges.push(
      edge('edge-cycle-a', 'cycle-a', 'cycle-b'),
      edge('edge-cycle-b', 'cycle-b', 'cycle-a'),
    );

    expect(validateTree(graph)).toMatchObject({ error: { code: 'CYCLE' }, ok: false });
  });

  it('covers AT-041 multiple roots, missing parents, excessive size, and excessive depth', () => {
    const multipleRoots = initialGraph();
    multipleRoots.edges = multipleRoots.edges.filter((item) => item.targetNodeId !== 'detail-1');
    expect(validateInitialMap(multipleRoots)).toMatchObject({
      error: { code: 'ROOT_COUNT' },
      ok: false,
    });

    const missingParent = initialGraph();
    missingParent.edges[3] = { ...missingParent.edges[3]!, sourceNodeId: 'missing-parent' };
    expect(validateInitialMap(missingParent)).toMatchObject({
      error: { code: 'INVALID_EDGE' },
      ok: false,
    });

    const excessiveSize = initialGraph();
    for (let index = 0; index < 8; index += 1) {
      const id = `extra-${index}`;
      excessiveSize.nodes.push(node({ id, kind: 'NOTE', title: `Extra ${index}` }));
      excessiveSize.edges.push(edge(`edge-${id}`, 'topic-1', id));
    }
    expect(validateInitialMap(excessiveSize)).toMatchObject({
      error: { code: 'INITIAL_NODE_COUNT' },
      ok: false,
    });

    const excessiveDepth = initialGraph();
    excessiveDepth.nodes.push(node({ id: 'depth-3', kind: 'NOTE', title: 'Too deep' }));
    excessiveDepth.edges.push(edge('edge-depth-3', 'detail-1', 'depth-3'));
    expect(validateInitialMap(excessiveDepth)).toMatchObject({
      error: { code: 'INITIAL_DEPTH' },
      ok: false,
    });
  });

  it('validates canonical node time, finite position, and bounded parent suggestions', () => {
    const invalidSuggestion = initialGraph();
    invalidSuggestion.nodes[4] = {
      ...invalidSuggestion.nodes[4]!,
      parentSuggestion: {
        alternativeParentNodeIds: ['root', 'root'],
        createdAt,
        rationale: 'Move this option',
        recommendedParentNodeId: 'topic-1',
      },
    };
    expect(validateTree(invalidSuggestion)).toMatchObject({
      error: { code: 'INVALID_PARENT_SUGGESTION' },
      ok: false,
    });

    const invalidSuggestionTimestamp = initialGraph();
    invalidSuggestionTimestamp.nodes[4] = {
      ...invalidSuggestionTimestamp.nodes[4]!,
      parentSuggestion: {
        alternativeParentNodeIds: [],
        createdAt: '2026-08-29T17:30:00+08:00',
        rationale: 'Move this option',
        recommendedParentNodeId: 'topic-1',
      },
    };
    expect(validateTree(invalidSuggestionTimestamp)).toMatchObject({
      error: { code: 'INVALID_PARENT_SUGGESTION' },
      ok: false,
    });

    const invalidTimestamp = initialGraph();
    invalidTimestamp.nodes[4] = {
      ...invalidTimestamp.nodes[4]!,
      updatedAt: '2026-08-29T17:30:00+08:00',
    };
    expect(validateTree(invalidTimestamp)).toMatchObject({
      error: { code: 'INVALID_TIMESTAMP' },
      ok: false,
    });

    const invalidPosition = initialGraph();
    invalidPosition.nodes[4] = {
      ...invalidPosition.nodes[4]!,
      position: { x: Number.NaN, y: 0 },
    };
    expect(validateTree(invalidPosition)).toMatchObject({
      error: { code: 'INVALID_POSITION' },
      ok: false,
    });

    const invalidStrategy = initialGraph();
    invalidStrategy.nodes[4] = {
      ...invalidStrategy.nodes[4]!,
      strategyId: 'UNSUPPORTED_STRATEGY',
    } as unknown as MindMapNode;
    expect(validateTree(invalidStrategy)).toMatchObject({
      error: { code: 'INVALID_STRATEGY' },
      ok: false,
    });

    for (const invalidOrder of [-1, 0.5]) {
      const invalidEdgeOrder = initialGraph();
      invalidEdgeOrder.edges[3] = { ...invalidEdgeOrder.edges[3]!, order: invalidOrder };
      expect(validateTree(invalidEdgeOrder)).toMatchObject({
        error: { code: 'INVALID_EDGE' },
        ok: false,
      });
    }
  });

  it('applies exactly two to four expansion children without changing existing nodes', () => {
    const graph = initialGraph();
    const originalNodes = structuredClone(graph.nodes);
    const result = applyExpansion(graph, 'topic-1', [
      {
        edgeId: 'edge-expanded-1',
        node: node({
          id: 'expanded-1',
          kind: 'OPTION',
          source: 'EXPANSION_AI',
          strategyId: 'DECISION_ADD_OPTION',
          title: 'Launch in two regions',
        }),
      },
      {
        edgeId: 'edge-expanded-2',
        node: node({
          id: 'expanded-2',
          kind: 'OPTION',
          source: 'EXPANSION_AI',
          strategyId: 'DECISION_ADD_OPTION',
          title: 'Delay the launch',
        }),
      },
    ]);

    expect(result).toMatchObject({
      ok: true,
      value: { nodes: expect.arrayContaining(originalNodes) },
    });
    expect(graph.nodes).toEqual(originalNodes);
  });

  it('rejects a reparent that would create a cycle and returns stable subtree membership', () => {
    const graph = initialGraph();

    expect(reparentNode(graph, 'topic-1', 'detail-1')).toMatchObject({
      error: { code: 'CYCLE' },
      ok: false,
    });
    expect(subtreeNodeIds(graph, 'topic-1')).toEqual({
      ok: true,
      value: ['topic-1', 'detail-1'],
    });
  });

  it('reorders only root TOPIC edges when reparenting around a root quick note', () => {
    const graph = initialGraph();
    graph.nodes.push(
      node({ id: 'quick-note', kind: 'NOTE', source: 'QUICK_NOTE', title: 'Unsorted thought' }),
    );
    graph.edges.push(edge('edge-quick-note', 'root', 'quick-note'));

    const movedOut = reparentNode(graph, 'topic-3', 'topic-1');
    expect(movedOut.ok).toBe(true);
    if (!movedOut.ok) return;
    expect(
      movedOut.value.edges.find((item) => item.id === 'edge-quick-note')?.order,
    ).toBeUndefined();
    expect(orderedTopicIds(movedOut.value)).toEqual({
      ok: true,
      value: ['topic-1', 'topic-2'],
    });

    const movedBack = reparentNode(movedOut.value, 'topic-3', 'root');
    expect(movedBack.ok).toBe(true);
    if (!movedBack.ok) return;
    expect(
      movedBack.value.edges.find((item) => item.id === 'edge-quick-note')?.order,
    ).toBeUndefined();
    expect(orderedTopicIds(movedBack.value)).toEqual({
      ok: true,
      value: ['topic-1', 'topic-2', 'topic-3'],
    });
  });

  it('inserts explicit user nodes without mutating the source graph', () => {
    const graph = initialGraph();
    const inserted = insertNode(
      graph,
      'topic-2',
      node({ id: 'manual-note', kind: 'NOTE', source: 'USER', title: 'Confirm the threshold' }),
      'edge-manual-note',
    );

    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.value.nodes.map(({ id }) => id)).toContain('manual-note');
    expect(inserted.value.edges).toContainEqual(edge('edge-manual-note', 'topic-2', 'manual-note'));
    expect(graph.nodes.map(({ id }) => id)).not.toContain('manual-note');
  });

  it('appends and renumbers explicit topic changes', () => {
    const graph = initialGraph();
    const inserted = insertNode(
      graph,
      'root',
      node({
        id: 'topic-4',
        kind: 'TOPIC',
        source: 'USER',
        title: 'Dependencies',
        topicPrompt: 'Which dependency blocks the decision?',
        transitionHint: 'Return to the final choice.',
      }),
      'edge-topic-4',
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(orderedTopicIds(inserted.value)).toEqual({
      ok: true,
      value: ['topic-1', 'topic-2', 'topic-3', 'topic-4'],
    });

    const removed = deleteSubtree(inserted.value, 'topic-2');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.nodes.map(({ id }) => id)).not.toContain('topic-2');
    expect(orderedTopicIds(removed.value)).toEqual({
      ok: true,
      value: ['topic-1', 'topic-3', 'topic-4'],
    });
    expect(
      removed.value.edges
        .filter(({ sourceNodeId }) => sourceNodeId === 'root')
        .map(({ order }) => order),
    ).toEqual([1, 0, 2]);
  });

  it('rejects manual nested topics and root deletion', () => {
    const graph = initialGraph();
    expect(
      insertNode(
        graph,
        'topic-1',
        node({
          id: 'nested-topic',
          kind: 'TOPIC',
          source: 'USER',
          title: 'Nested topic',
          topicPrompt: 'Why?',
          transitionHint: 'Continue.',
        }),
        'edge-nested-topic',
      ),
    ).toMatchObject({ error: { code: 'INVALID_TOPIC' }, ok: false });
    expect(deleteSubtree(graph, 'root')).toMatchObject({
      error: { code: 'INVALID_DELETE' },
      ok: false,
    });
  });
});
