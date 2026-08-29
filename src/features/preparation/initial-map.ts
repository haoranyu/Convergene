import { createLeftToRightLayout } from '@/modules/integration-validation/dagre-layout';
import type { SupportedLocale } from '@/modules/meeting-domain';
import {
  validateInitialMap,
  type GraphErrorCode,
  type MeetingGraph,
  type MindMapEdge,
  type MindMapNode,
} from '@/modules/mind-map-domain';

import {
  initialMapOutputSchema,
  type InitialMapInput,
  type InitialMapOutput,
  type PreparationAIClient,
} from './ai-contract';

export class InitialMapValidationError extends Error {
  constructor(readonly code: GraphErrorCode | 'OUTPUT_INVALID') {
    super(code);
    this.name = 'InitialMapValidationError';
  }
}

interface MaterializeInitialMapOptions {
  createId?: () => string;
  now?: Date;
}

function buildValidationGraph(
  output: InitialMapOutput,
  meetingId: string,
  timestamp: string,
): MeetingGraph {
  const idsByKey = new Map(output.nodes.map((node, index) => [node.key, `draft-${index}`]));
  const nodes: MindMapNode[] = output.nodes.map((node) => ({
    createdAt: timestamp,
    id: idsByKey.get(node.key)!,
    kind: node.kind,
    meetingId,
    note: node.note,
    position: { x: 0, y: 0 },
    source: 'INITIAL_AI',
    title: node.title,
    topicPrompt: node.topicPrompt,
    transitionHint: node.transitionHint,
    updatedAt: timestamp,
  }));
  const edges: MindMapEdge[] = output.nodes.flatMap((node, index) => {
    if (node.parentKey === undefined) return [];
    const sourceNodeId = idsByKey.get(node.parentKey);
    const targetNodeId = idsByKey.get(node.key);
    if (sourceNodeId === undefined || targetNodeId === undefined) {
      throw new InitialMapValidationError('INVALID_EDGE');
    }
    return [
      {
        id: `draft-edge-${index}`,
        kind: 'CONTAINS' as const,
        meetingId,
        order: node.order,
        sourceNodeId,
        targetNodeId,
      },
    ];
  });
  return { edges, meetingId, nodes };
}

function buildGraph(
  output: InitialMapOutput,
  meetingId: string,
  now: Date,
  createId: () => string,
): MeetingGraph {
  const timestamp = now.toISOString();
  const idsByKey = new Map(output.nodes.map((node) => [node.key, createId()]));
  const rawEdges: MindMapEdge[] = output.nodes.flatMap((node) => {
    if (node.parentKey === undefined) return [];
    const sourceNodeId = idsByKey.get(node.parentKey);
    const targetNodeId = idsByKey.get(node.key);
    if (sourceNodeId === undefined || targetNodeId === undefined) {
      throw new InitialMapValidationError('INVALID_EDGE');
    }
    return [
      {
        id: createId(),
        kind: 'CONTAINS' as const,
        meetingId,
        order: node.order,
        sourceNodeId,
        targetNodeId,
      },
    ];
  });
  const layout = createLeftToRightLayout(
    output.nodes.map((node) => ({
      height: node.kind === 'OBJECTIVE' ? 96 : 80,
      id: idsByKey.get(node.key)!,
      title: node.title,
      width: node.kind === 'OBJECTIVE' ? 240 : 216,
    })),
    rawEdges.map((edge) => ({
      id: edge.id,
      order: edge.order,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
    })),
  );
  const positions = new Map(layout.nodes.map((node) => [node.id, node.position]));
  const nodes: MindMapNode[] = output.nodes.map((node) => ({
    createdAt: timestamp,
    id: idsByKey.get(node.key)!,
    kind: node.kind,
    meetingId,
    note: node.note,
    position: positions.get(idsByKey.get(node.key)!)!,
    source: 'INITIAL_AI',
    title: node.title,
    topicPrompt: node.topicPrompt,
    transitionHint: node.transitionHint,
    updatedAt: timestamp,
  }));
  return { edges: rawEdges, meetingId, nodes };
}

export function materializeInitialMap(
  value: unknown,
  meetingId: string,
  options: MaterializeInitialMapOptions = {},
): MeetingGraph {
  const parsed = initialMapOutputSchema.safeParse(value);
  if (!parsed.success) throw new InitialMapValidationError('OUTPUT_INVALID');
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new InitialMapValidationError('INVALID_TIMESTAMP');
  const output = parsed.data;
  if (new Set(output.nodes.map(({ key }) => key)).size !== output.nodes.length) {
    throw new InitialMapValidationError('DUPLICATE_NODE_ID');
  }
  const draftGraph = buildValidationGraph(output, meetingId, now.toISOString());
  const draftValidation = validateInitialMap(draftGraph);
  if (!draftValidation.ok) {
    throw new InitialMapValidationError(draftValidation.error.code);
  }
  const graph = buildGraph(output, meetingId, now, options.createId ?? (() => crypto.randomUUID()));
  const validation = validateInitialMap(graph);
  if (!validation.ok) throw new InitialMapValidationError(validation.error.code);
  return graph;
}

/** The server owns the single repair and fallback policy; the browser never repeats AI calls. */
export async function requestValidInitialMap(
  client: PreparationAIClient,
  input: InitialMapInput,
  meetingId: string,
  outputLocale: SupportedLocale,
  options: MaterializeInitialMapOptions & { signal?: AbortSignal } = {},
): Promise<MeetingGraph> {
  const snapshot = structuredClone(input);
  const output = await client.initialMap(snapshot, outputLocale, options.signal);
  return materializeInitialMap(output, meetingId, options);
}
