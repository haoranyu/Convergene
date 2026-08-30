import { describe, expect, it } from 'vitest';

import { createMeetingCanvasTestFixture } from './meeting-canvas-test-fixture';
import { buildExpandNodeInput, buildExpansionChildren, quickNoteParent } from './node-assistance';

describe('meeting node assistance', () => {
  it('builds minimal bounded context around the selected node', () => {
    const aggregate = createMeetingCanvasTestFixture();
    const input = buildExpandNodeInput(aggregate, 'topic-options', 'DECISION_ADD_OPTION');

    expect(input).toMatchObject({
      mode: 'DECISION',
      parent: { id: 'objective' },
      selectedNode: { id: 'topic-options' },
      strategyId: 'DECISION_ADD_OPTION',
    });
    expect(input.briefSummary).toContain(aggregate.meeting.brief!.objective);
    expect(input.siblings).toHaveLength(3);
    expect(input.children).toHaveLength(2);
    expect(input.selectedNode).not.toHaveProperty('position');
    expect(input).not.toHaveProperty('meetingId');
  });

  it('preserves both brief fields while omitting non-selected notes from live context', () => {
    const aggregate = createMeetingCanvasTestFixture();
    aggregate.meeting.brief = {
      ...aggregate.meeting.brief!,
      desiredOutcome: 'd'.repeat(1_000),
      objective: 'o'.repeat(1_000),
    };
    const selectedNode = aggregate.nodes.find((node) => node.id === 'topic-options')!;
    const childNode = aggregate.nodes.find((node) => node.id === 'option-guided')!;
    const siblingNode = aggregate.nodes.find((node) => node.id === 'topic-audience')!;
    selectedNode.note = 's'.repeat(240);
    childNode.note = 'child detail that is not required by the provider';
    siblingNode.note = 'sibling detail that is not required by the provider';

    for (let index = 0; index < 8; index += 1) {
      const id = `extra-child-${index}`;
      aggregate.nodes.push({
        ...structuredClone(childNode),
        id,
        title: `Extra child ${index}`,
      });
      aggregate.edges.push({
        id: `extra-edge-${index}`,
        kind: 'CONTAINS',
        meetingId: aggregate.meeting.id,
        order: index + 2,
        sourceNodeId: selectedNode.id,
        targetNodeId: id,
      });
    }

    const input = buildExpandNodeInput(aggregate, selectedNode.id, 'DECISION_ADD_OPTION');

    expect(input.briefSummary).toHaveLength(1_200);
    expect(input.briefSummary).toContain('o'.repeat(600));
    expect(input.briefSummary).toContain('d'.repeat(599));
    expect(input.children).toHaveLength(8);
    expect(input.children.every((child) => child.note === undefined)).toBe(true);
    expect(input.siblings.every((sibling) => sibling.note === undefined)).toBe(true);
    expect(input.parent).not.toHaveProperty('note');
    expect(input.selectedNode.note).toBe('s'.repeat(160));
  });

  it('creates valid expansion records without modifying the existing graph', () => {
    const aggregate = createMeetingCanvasTestFixture();
    const before = structuredClone(aggregate);
    const children = buildExpansionChildren({
      drafts: [
        { kind: 'OPTION', title: 'Pilot with one team' },
        { kind: 'RISK', note: 'Budget owner is unknown', title: 'Budget approval' },
      ],
      meetingId: aggregate.meeting.id,
      parent: aggregate.nodes.find((node) => node.id === 'topic-options')!,
      strategyId: 'DECISION_ADD_OPTION',
      timestamp: '2026-08-29T10:01:00.000Z',
      uuid: (() => {
        let value = 0;
        return () => `generated-${++value}`;
      })(),
    });

    expect(children).toHaveLength(2);
    expect(children.every(({ node }) => node.source === 'EXPANSION_AI')).toBe(true);
    expect(children.every(({ node }) => node.strategyId === 'DECISION_ADD_OPTION')).toBe(true);
    expect(aggregate).toEqual(before);
  });

  it('uses the active topic for quick notes and falls back to the root explicitly', () => {
    const aggregate = createMeetingCanvasTestFixture();
    expect(quickNoteParent(aggregate)).toEqual({
      fallbackToRoot: false,
      parentNodeId: 'topic-audience',
    });

    aggregate.meeting.activeTopicNodeId = undefined;
    expect(quickNoteParent(aggregate)).toEqual({
      fallbackToRoot: true,
      parentNodeId: 'objective',
    });
  });
});
