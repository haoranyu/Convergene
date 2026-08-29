import { describe, expect, it } from 'vitest';

import {
  longEnglishMeetingTreeEdges,
  longEnglishMeetingTreeNodes,
} from '@/fixtures/integration-validation/long-english-meeting-tree';

import { createLeftToRightLayout } from './dagre-layout';
import { calculateSubtreeFocus } from './subtree-focus';

const layout = createLeftToRightLayout(longEnglishMeetingTreeNodes, longEnglishMeetingTreeEdges);

describe('explicit subtree focus calculation', () => {
  it('fits only the selected topic and its descendants', () => {
    const focus = calculateSubtreeFocus(layout.nodes, layout.edges, 'topic-criteria', {
      height: 720,
      width: 1_280,
    });

    expect(focus.nodeIds).toEqual(['topic-criteria', 'criteria-speed', 'criteria-safety']);
    expect(focus.nodeIds).not.toContain('objective');
    expect(focus.bounds.width).toBeGreaterThan(0);
    expect(focus.bounds.height).toBeGreaterThan(0);
    expect(focus.viewport.zoom).toBeGreaterThanOrEqual(0.5);
    expect(focus.viewport.zoom).toBeLessThanOrEqual(1.5);
    expect(Number.isFinite(focus.viewport.x)).toBe(true);
    expect(Number.isFinite(focus.viewport.y)).toBe(true);
  });

  it('rejects missing nodes and invalid viewport dimensions', () => {
    expect(() =>
      calculateSubtreeFocus(layout.nodes, layout.edges, 'missing', {
        height: 720,
        width: 1_280,
      }),
    ).toThrow('Cannot focus missing subtree root');
    expect(() =>
      calculateSubtreeFocus(layout.nodes, layout.edges, 'topic-criteria', {
        height: 0,
        width: 1_280,
      }),
    ).toThrow('Viewport dimensions must be positive');
  });
});
