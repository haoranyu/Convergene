import { describe, expect, it } from 'vitest';

import type { MeetingGraph, MindMapEdge, MindMapNode } from '@/modules/mind-map-domain';

import { layoutMeetingGraph, meetingNodeSize } from './layout';

const meetingId = 'layout-meeting';
const createdAt = '2026-08-29T09:00:00.000Z';

function node(
  id: string,
  kind: MindMapNode['kind'],
  title: string,
  topicOrder?: number,
): MindMapNode {
  return {
    createdAt,
    id,
    kind,
    meetingId,
    position: { x: 0, y: topicOrder ?? 0 },
    source: 'INITIAL_AI',
    title,
    ...(kind === 'TOPIC'
      ? { topicPrompt: `Prompt ${id}`, transitionHint: `Transition ${id}` }
      : {}),
    updatedAt: createdAt,
  };
}

function edge(id: string, sourceNodeId: string, targetNodeId: string, order?: number): MindMapEdge {
  return { id, kind: 'CONTAINS', meetingId, order, sourceNodeId, targetNodeId };
}

function graph(): MeetingGraph {
  return {
    edges: [
      edge('edge-topic-3', 'root', 'topic-3', 2),
      edge('edge-topic-1', 'root', 'topic-1', 0),
      edge('edge-topic-2', 'root', 'topic-2', 1),
      edge('edge-child-1', 'topic-1', 'child-1'),
      edge('edge-child-2', 'topic-2', 'child-2'),
    ],
    meetingId,
    nodes: [
      node('root', 'OBJECTIVE', 'Choose the launch approach'),
      node('topic-1', 'TOPIC', 'Audience', 0),
      node('topic-2', 'TOPIC', 'Criteria', 1),
      node('topic-3', 'TOPIC', 'Risks', 2),
      node('child-1', 'NOTE', 'First-time facilitators'),
      node('child-2', 'OPTION', 'Five-minute preparation'),
    ],
  };
}

describe('meeting LR layout', () => {
  it('covers AT-043 without changing relationships or caller data', () => {
    const source = graph();
    const snapshot = structuredClone(source);
    const result = layoutMeetingGraph(source, '2026-08-29T09:05:00.000Z');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(source).toEqual(snapshot);
    expect(result.value.edges).toEqual(source.edges);

    const nodes = new Map(result.value.nodes.map((candidate) => [candidate.id, candidate]));
    for (const relationship of result.value.edges) {
      expect(nodes.get(relationship.sourceNodeId)!.position.x).toBeLessThan(
        nodes.get(relationship.targetNodeId)!.position.x,
      );
    }
    expect(['topic-1', 'topic-2', 'topic-3'].map((id) => nodes.get(id)!.position.y)).toEqual(
      ['topic-1', 'topic-2', 'topic-3']
        .map((id) => nodes.get(id)!.position.y)
        .sort((left, right) => left - right),
    );
    expect(
      result.value.nodes.every((candidate) => candidate.updatedAt.endsWith('05:00.000Z')),
    ).toBe(true);
  });

  it('is deterministic and keeps fixed canvas node dimensions', () => {
    const first = layoutMeetingGraph(graph());
    const second = layoutMeetingGraph(graph());
    expect(first).toEqual(second);
    expect(meetingNodeSize).toEqual({ height: 88, width: 288 });
  });

  it('rejects invalid timestamps before laying out', () => {
    expect(layoutMeetingGraph(graph(), '2026-08-29T17:05:00+08:00')).toMatchObject({
      error: { code: 'INVALID_TIMESTAMP' },
      ok: false,
    });
  });
});
