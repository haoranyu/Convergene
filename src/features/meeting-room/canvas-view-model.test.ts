import { describe, expect, it } from 'vitest';

import { buildCanvasElements } from './canvas-view-model';
import { createMeetingCanvasTestFixture } from './meeting-canvas-test-fixture';
import { focusDuration } from './meeting-canvas-view';

const labels = {
  activeTopic: 'Current topic',
  nodeKinds: {
    ACTION: 'Action',
    IDEA: 'Idea',
    INSIGHT: 'Insight',
    NOTE: 'Note',
    OBJECTIVE: 'Meeting objective',
    OPTION: 'Option',
    PARKING: 'Parking lot',
    RISK: 'Risk',
    TOPIC: 'Topic',
  },
  outcome: 'Meeting outcome',
};

describe('meeting canvas view model', () => {
  it('keeps ordinary selection separate from the unique active topic', () => {
    const elements = buildCanvasElements(
      createMeetingCanvasTestFixture(),
      labels,
      'topic-criteria',
    );
    const activeTopic = elements.nodes.find((node) => node.data.isActiveTopic);
    const selectedNode = elements.nodes.find((node) => node.selected);

    expect(activeTopic?.id).toBe('topic-audience');
    expect(selectedNode?.id).toBe('topic-criteria');
    expect(selectedNode?.data.isActiveTopic).toBe(false);
  });

  it('dims inactive branches while keeping the objective and active subtree available', () => {
    const elements = buildCanvasElements(createMeetingCanvasTestFixture(), labels);

    expect(elements.nodes.find((node) => node.id === 'objective')?.data.dimmed).toBe(false);
    expect(elements.nodes.find((node) => node.id === 'topic-audience')?.data.dimmed).toBe(false);
    expect(elements.nodes.find((node) => node.id === 'audience-primary')?.data.dimmed).toBe(false);
    expect(elements.nodes.find((node) => node.id === 'topic-criteria')?.data.dimmed).toBe(true);
    expect(elements.edges.find((edge) => edge.id === 'edge-objective-criteria')?.data).toEqual({
      dimmed: true,
    });
  });

  it('provides a visible outcome label instead of relying on color alone', () => {
    const elements = buildCanvasElements(createMeetingCanvasTestFixture(), labels);
    const outcomeNode = elements.nodes.find((node) => node.id === 'option-guided');

    expect(outcomeNode?.data.isOutcome).toBe(true);
    expect(outcomeNode?.data.outcomeLabel).toBe('Meeting outcome');
    expect(outcomeNode?.ariaLabel).toContain('Meeting outcome');
  });

  it('removes focus animation when reduced motion is requested', () => {
    expect(focusDuration(true, 'topic')).toBe(0);
    expect(focusDuration(true, 'all')).toBe(0);
    expect(focusDuration(false, 'topic')).toBe(250);
    expect(focusDuration(false, 'all')).toBe(200);
  });
});
