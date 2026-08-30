import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  expandNodeOutputSchema,
  expandNodeRequestSchema,
  expandNodeResponseSchema,
  strategyIdsForMode,
} from './expand-node';

const node = {
  id: 'node-1',
  kind: 'TOPIC' as const,
  title: 'Choose a launch path',
};

describe('expand-node contract', () => {
  it('maps every meeting mode to exactly three stable strategies', () => {
    expect(strategyIdsForMode).toEqual({
      BRAINSTORM: ['BRAINSTORM_GO_WILDER', 'BRAINSTORM_CHANGE_LENS', 'BRAINSTORM_CONVERGE'],
      DECISION: ['DECISION_ADD_OPTION', 'DECISION_SURFACE_RISK', 'DECISION_DRIVE_CHOICE'],
      GENERAL: ['GENERAL_DIVERGE', 'GENERAL_DECOMPOSE', 'GENERAL_CHALLENGE'],
      RETRO: ['RETRO_FIND_CAUSE', 'RETRO_FIND_COUNTEREXAMPLE', 'RETRO_TURN_INTO_ACTION'],
    });
    expect(new Set(Object.values(strategyIdsForMode).flat()).size).toBe(12);
  });

  it('accepts only bounded one-hop context and a strategy belonging to the mode', () => {
    const value = expandNodeRequestSchema.parse({
      input: {
        briefSummary: 'Decide which launch path to use.',
        children: Array.from({ length: 8 }, (_, index) => ({
          ...node,
          id: `child-${index}`,
        })),
        mode: 'DECISION',
        parent: { ...node, id: 'parent' },
        selectedNode: node,
        siblings: [],
        strategyId: 'DECISION_ADD_OPTION',
      },
      outputLocale: 'en-US',
      requestId: '11111111-1111-4111-8111-111111111111',
      task: 'expand-node',
    });

    expect(value.input.children).toHaveLength(8);
    expect(() =>
      expandNodeRequestSchema.parse({
        ...value,
        input: {
          ...value.input,
          siblings: Array.from({ length: 9 }, (_, index) => ({
            ...node,
            id: `sibling-${index}`,
          })),
        },
      }),
    ).toThrow();
    expect(() =>
      expandNodeRequestSchema.parse({
        ...value,
        input: { ...value.input, strategyId: 'RETRO_FIND_CAUSE' },
      }),
    ).toThrow();
  });

  it('rejects malformed child counts and unbounded child text', () => {
    expect(() => expandNodeOutputSchema.parse({ children: [node] })).toThrow();
    expect(() =>
      expandNodeOutputSchema.parse({
        children: Array.from({ length: 5 }, (_, index) => ({
          kind: 'IDEA',
          title: `Idea ${index}`,
        })),
      }),
    ).toThrow();
    expect(() =>
      expandNodeOutputSchema.parse({
        children: [
          { kind: 'IDEA', title: 'a'.repeat(49) },
          { kind: 'IDEA', title: 'Valid title' },
        ],
      }),
    ).toThrow();
  });

  it('publishes the 48-character title bound in the provider JSON Schema', () => {
    const schema = z.toJSONSchema(expandNodeOutputSchema) as unknown as {
      properties: {
        children: { items: { properties: { title: { maxLength?: number } } } };
      };
    };

    expect(schema.properties.children.items.properties.title.maxLength).toBe(48);
  });

  it('keeps the runtime title limit grapheme-aware for astral Unicode', () => {
    expect(() =>
      expandNodeOutputSchema.parse({
        children: [
          { kind: 'IDEA', title: '😀'.repeat(30) },
          { kind: 'IDEA', title: 'Valid title' },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      expandNodeOutputSchema.parse({
        children: [
          { kind: 'IDEA', title: '😀'.repeat(49) },
          { kind: 'IDEA', title: 'Valid title' },
        ],
      }),
    ).toThrow();
  });

  it('requires the response to preserve the pending request and task ids', () => {
    const response = expandNodeResponseSchema.parse({
      output: {
        children: [
          { kind: 'OPTION', title: 'Guided rollout' },
          { kind: 'RISK', title: 'Training cost' },
        ],
      },
      requestId: '11111111-1111-4111-8111-111111111111',
      task: 'expand-node',
    });
    expect(response.task).toBe('expand-node');
  });
});
