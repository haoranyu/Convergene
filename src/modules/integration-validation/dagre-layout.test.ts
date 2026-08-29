import { describe, expect, it } from 'vitest';

import {
  longEnglishMeetingTreeEdges,
  longEnglishMeetingTreeNodes,
} from '@/fixtures/integration-validation/long-english-meeting-tree';

import { createLeftToRightLayout, type PositionedIntegrationNode } from './dagre-layout';

function overlaps(left: PositionedIntegrationNode, right: PositionedIntegrationNode): boolean {
  return !(
    left.position.x + left.width <= right.position.x ||
    right.position.x + right.width <= left.position.x ||
    left.position.y + left.height <= right.position.y ||
    right.position.y + right.height <= left.position.y
  );
}

describe('12-node long-English Dagre validation', () => {
  it('keeps near-boundary English titles inside the 48-grapheme domain limit', () => {
    const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const titleLengths = longEnglishMeetingTreeNodes.map(
      (node) => [...graphemeSegmenter.segment(node.title)].length,
    );

    expect(longEnglishMeetingTreeNodes).toHaveLength(12);
    expect(Math.max(...titleLengths)).toBe(48);
    expect(titleLengths.every((length) => length <= 48)).toBe(true);
  });

  it('creates a finite LR layout without changing relationships', () => {
    const layout = createLeftToRightLayout(
      longEnglishMeetingTreeNodes,
      longEnglishMeetingTreeEdges,
    );
    const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));

    expect(layout.nodes).toHaveLength(12);
    expect(layout.edges).toEqual(longEnglishMeetingTreeEdges);
    expect(layout.width).toBeGreaterThan(layout.height);

    for (const node of layout.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }

    for (const edge of layout.edges) {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);
      expect(source).toBeDefined();
      expect(target).toBeDefined();
      expect(source!.position.x).toBeLessThan(target!.position.x);
    }

    for (const [index, left] of layout.nodes.entries()) {
      for (const right of layout.nodes.slice(index + 1)) {
        expect(overlaps(left, right), `${left.id} overlaps ${right.id}`).toBe(false);
      }
    }
  });

  it('keeps first-level topic order stable across repeated layouts', () => {
    const first = createLeftToRightLayout(longEnglishMeetingTreeNodes, longEnglishMeetingTreeEdges);
    const second = createLeftToRightLayout(
      longEnglishMeetingTreeNodes,
      longEnglishMeetingTreeEdges,
    );
    const topicIds = longEnglishMeetingTreeEdges
      .filter((edge) => edge.source === 'objective')
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map((edge) => edge.target);
    const yPositions = topicIds.map((id) => first.nodes.find((node) => node.id === id)!.position.y);

    expect(yPositions).toEqual([...yPositions].sort((left, right) => left - right));
    expect(second.nodes).toEqual(first.nodes);
  });
});
