import { describe, expect, it, vi } from 'vitest';

import {
  initialMapOutputFixtures,
  preparationBriefFixtures,
  primaryPreparationModes,
} from '@/fixtures/preparation';
import { validateInitialMap } from '@/modules/mind-map-domain';

import type { PreparationAIClient } from './ai-contract';
import {
  InitialMapValidationError,
  materializeInitialMap,
  requestValidInitialMap,
} from './initial-map';

describe('initial map materialization', () => {
  it.each(primaryPreparationModes)('creates a valid positioned %s initial graph', (mode) => {
    let sequence = 0;
    const graph = materializeInitialMap(initialMapOutputFixtures[mode], 'meeting-1', {
      createId: () => `generated-${sequence++}`,
      now: new Date('2026-08-29T09:40:00.000Z'),
    });
    expect(validateInitialMap(graph).ok).toBe(true);
    expect(graph.nodes.every(({ position }) => Number.isFinite(position.x + position.y))).toBe(
      true,
    );
    expect(graph.nodes.every(({ source }) => source === 'INITIAL_AI')).toBe(true);
  });

  it('rejects duplicate keys and non-contiguous topic order before returning a graph', () => {
    expect(() =>
      materializeInitialMap(
        {
          ...initialMapOutputFixtures.DECISION,
          nodes: initialMapOutputFixtures.DECISION.nodes.map((node, index) =>
            index === 1 ? { ...node, key: 'root' } : node,
          ),
        },
        'meeting-1',
      ),
    ).toThrowError(InitialMapValidationError);
    expect(() =>
      materializeInitialMap(
        {
          ...initialMapOutputFixtures.DECISION,
          nodes: initialMapOutputFixtures.DECISION.nodes.map((node) =>
            node.key === 'choice' ? { ...node, order: 4 } : node,
          ),
        },
        'meeting-1',
      ),
    ).toThrowError(/INVALID_TOPIC_ORDER/);
  });

  it('does not repeat an invalid browser response because repair belongs to the server', async () => {
    const invalid = {
      ...initialMapOutputFixtures.DECISION,
      nodes: initialMapOutputFixtures.DECISION.nodes.slice(0, 2),
    };
    const initialMap = vi.fn<PreparationAIClient['initialMap']>().mockResolvedValue(invalid);
    const client: PreparationAIClient = {
      grill: vi.fn(),
      initialMap,
    };
    const input = { brief: preparationBriefFixtures.DECISION, mode: 'DECISION' as const };
    await expect(
      requestValidInitialMap(client, input, 'meeting-1', 'en-US', {
        now: new Date('2026-08-29T09:40:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InitialMapValidationError);
    expect(initialMap).toHaveBeenCalledTimes(1);
    expect(initialMap.mock.calls[0]?.[0]).not.toBe(input);
  });
});
