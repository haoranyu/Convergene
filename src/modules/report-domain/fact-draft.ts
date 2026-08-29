import { calculateMeetingEconomics } from '@/modules/meeting-domain';
import type { Meeting, MeetingOutcome } from '@/modules/meeting-domain';
import { validateTree } from '@/modules/mind-map-domain';
import type { MeetingGraph, MindMapNode, NodeKind } from '@/modules/mind-map-domain';
import type { Result } from '@/modules/shared';
import { isCanonicalUtcTimestamp } from '@/modules/shared';

import { modeFactKeys } from './model';
import type {
  ReportAIFacts,
  ReportAIOutcomeFact,
  ReportDomainErrorCode,
  ReportFacts,
  ReportOutcomeFact,
  ReportTreeNode,
} from './model';

/**
 * Explicit context the report domain cannot derive from stored meeting data.
 * `timezone` is a per-report display choice owned by the caller (Issue #10
 * report route passes the browser's IANA zone); the module never reads a
 * system clock or default zone.
 */
export interface FactDraftContext {
  timezone: string;
}

function failure(code: ReportDomainErrorCode): Result<never, ReportDomainErrorCode> {
  return { error: { code }, ok: false };
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function byCreationThenId(left: MindMapNode, right: MindMapNode): number {
  return (
    Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id)
  );
}

function nodeTitles(nodes: readonly MindMapNode[]): string[] {
  return [...nodes].sort(byCreationThenId).map((node) => node.title);
}

/**
 * Node kinds that carry mode-specific story weight in the report flowchart.
 * Outcome-marked nodes are always included on top of these; topics are added
 * per mode as grouping context. GENERAL keeps the topic skeleton only.
 */
const flowchartKinds: Record<string, ReadonlySet<NodeKind>> = {
  BRAINSTORM: new Set<NodeKind>(['IDEA']),
  DECISION: new Set<NodeKind>(['OPTION', 'RISK']),
  GENERAL: new Set<NodeKind>(),
  RETRO: new Set<NodeKind>(['INSIGHT', 'ACTION']),
};

/**
 * Project the discussion tree down to the nodes a report flowchart can draw,
 * bridging each kept node to its nearest kept ancestor. This never invents
 * relationships: a bridged parent is still a true ancestor in the source
 * tree, with elided levels in between.
 */
function buildDiscussionTree(
  meeting: Meeting,
  graph: MeetingGraph,
  outcomeNodeIds: ReadonlySet<string>,
): ReportTreeNode[] {
  const mode = meeting.mode ?? 'GENERAL';
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const parentByNodeId = new Map(graph.edges.map((edge) => [edge.targetNodeId, edge.sourceNodeId]));
  const orderByNodeId = new Map(graph.edges.map((edge) => [edge.targetNodeId, edge.order]));
  const rootNode = graph.nodes.find((node) => node.kind === 'OBJECTIVE');

  if (rootNode === undefined) {
    return [];
  }

  const included = new Set<string>([rootNode.id]);
  const kinds = flowchartKinds[mode] ?? new Set<NodeKind>();

  for (const node of graph.nodes) {
    if (kinds.has(node.kind) || outcomeNodeIds.has(node.id)) {
      included.add(node.id);
    }
    if (mode === 'GENERAL' && node.kind === 'TOPIC') {
      included.add(node.id);
    }
  }

  if (mode === 'BRAINSTORM' || mode === 'RETRO') {
    for (const nodeId of [...included]) {
      let ancestorId = parentByNodeId.get(nodeId);
      while (ancestorId !== undefined) {
        const ancestor = nodesById.get(ancestorId);
        if (ancestor === undefined) break;
        if (ancestor.kind === 'TOPIC') {
          included.add(ancestorId);
        }
        ancestorId = parentByNodeId.get(ancestorId);
      }
    }
  }

  const nearestIncludedAncestor = (nodeId: string): string | undefined => {
    let ancestorId = parentByNodeId.get(nodeId);
    while (ancestorId !== undefined) {
      if (included.has(ancestorId)) {
        return ancestorId;
      }
      ancestorId = parentByNodeId.get(ancestorId);
    }
    return undefined;
  };

  return graph.nodes
    .filter((node) => included.has(node.id))
    .sort(byCreationThenId)
    .map((node) => ({
      createdAt: node.createdAt,
      isOutcome: outcomeNodeIds.has(node.id),
      kind: node.kind,
      nodeId: node.id,
      order: orderByNodeId.get(node.id),
      parentNodeId: node.id === rootNode.id ? undefined : nearestIncludedAncestor(node.id),
      title: node.title,
    }));
}

function buildModeFacts(
  meeting: Meeting,
  graph: MeetingGraph,
  outcomeNodeIdsByKind: Map<string, Set<string>>,
): Record<string, string[]> {
  const mode = meeting.mode ?? 'GENERAL';
  const keys = modeFactKeys[mode];

  if (keys.length === 0) {
    return {};
  }

  const outcomeNodeIds = new Set(
    [...outcomeNodeIdsByKind.values()].flatMap((nodeIds) => [...nodeIds]),
  );
  const nodesOfKind = (kind: MindMapNode['kind']) =>
    graph.nodes.filter((node) => node.kind === kind);
  const outcomeTitles = (kind: string) =>
    graph.nodes
      .filter((node) => outcomeNodeIdsByKind.get(kind)?.has(node.id) ?? false)
      .sort(byCreationThenId)
      .map((node) => node.title);

  const facts: Record<string, string[]> = {};

  for (const key of keys) {
    switch (mode) {
      case 'DECISION':
        if (key === 'decisions') {
          facts[key] = outcomeTitles('DECISION');
        } else if (key === 'unchosenOptions') {
          // Deterministic set difference: OPTION nodes the user never marked
          // as an outcome of any kind. Not a claim about why they were not
          // chosen, so the key deliberately avoids "abandoned".
          facts[key] = nodeTitles(
            nodesOfKind('OPTION').filter((node) => !outcomeNodeIds.has(node.id)),
          );
        } else {
          facts[key] = nodeTitles(nodesOfKind('RISK'));
        }
        break;
      case 'BRAINSTORM':
        if (key === 'candidateIdeas') {
          facts[key] = outcomeTitles('CANDIDATE_IDEA');
        } else if (key === 'exploredIdeas') {
          facts[key] = nodeTitles(nodesOfKind('IDEA'));
        } else {
          facts[key] = [...(meeting.brief?.assumptions ?? [])];
        }
        break;
      case 'RETRO':
        facts[key] = key === 'insights' ? outcomeTitles('INSIGHT') : outcomeTitles('ACTION');
        break;
      case 'GENERAL':
        break;
    }
  }

  return facts;
}

/**
 * Build the deterministic report fact base from trusted domain inputs only.
 *
 * Reports are post-meeting artifacts (product-spec §7.10–7.11): the meeting
 * must be ENDED, the graph must satisfy the tree invariants, and every
 * outcome must reference an existing node. Anything else fails closed with a
 * typed error instead of guessing. Costs come from
 * `calculateMeetingEconomics`, the single owner of the person-hour
 * algorithm; for an ENDED meeting its `now` is irrelevant, so the already
 * frozen `endedAt` is passed to keep this function free of hidden clocks.
 */
export function buildFactDraft(
  meeting: Meeting,
  graph: MeetingGraph,
  outcomes: readonly MeetingOutcome[],
  context: FactDraftContext,
): Result<ReportFacts, ReportDomainErrorCode> {
  if (meeting.status !== 'ENDED') {
    return failure('MEETING_NOT_ENDED');
  }

  if (
    !isCanonicalUtcTimestamp(meeting.scheduledStartAt) ||
    !isCanonicalUtcTimestamp(meeting.scheduledEndAt) ||
    !isCanonicalUtcTimestamp(meeting.startedAt) ||
    !isCanonicalUtcTimestamp(meeting.endedAt) ||
    Date.parse(meeting.endedAt) < Date.parse(meeting.startedAt)
  ) {
    return failure('INVALID_TIME_RANGE');
  }

  if (
    meeting.actualAttendeeCount === undefined ||
    !Number.isInteger(meeting.actualAttendeeCount) ||
    meeting.actualAttendeeCount <= 0
  ) {
    return failure('INVALID_ATTENDEE_COUNT');
  }

  if (typeof context.timezone !== 'string' || !isValidTimeZone(context.timezone)) {
    return failure('INVALID_TIMEZONE');
  }

  if (graph.meetingId !== meeting.id || !validateTree(graph).ok) {
    return failure('GRAPH_INVALID');
  }

  if (outcomes.some((outcome) => outcome.meetingId !== meeting.id)) {
    return failure('INVALID_OUTCOME');
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  if (outcomes.some((outcome) => !nodesById.has(outcome.nodeId))) {
    return failure('OUTCOME_NODE_MISSING');
  }

  // For ENDED meetings the economics clock is ignored in favor of endedAt.
  const economics = calculateMeetingEconomics(meeting, outcomes, new Date(meeting.endedAt));

  if (!economics.ok) {
    // The pre-checks above make these unreachable in practice; map explicitly
    // so the report domain never leaks another module's error vocabulary.
    const code = economics.error.code;
    if (code === 'INVALID_OUTCOME') return failure('INVALID_OUTCOME');
    if (code === 'INVALID_MEETING_STATE') return failure('INVALID_MEETING_STATE');
    return failure('INVALID_TIME_RANGE');
  }

  const formationCostByOutcomeId = new Map(
    economics.value.formationCosts.map((cost) => [cost.outcomeId, cost.formationPersonMinutes]),
  );

  const sortedOutcomes = [...outcomes].sort((left, right) => {
    if (left.origin !== right.origin) {
      return left.origin === 'LIVE' ? -1 : 1;
    }
    if (left.origin === 'LIVE' && right.origin === 'LIVE') {
      return (
        Date.parse(left.markedAt ?? '') - Date.parse(right.markedAt ?? '') ||
        left.id.localeCompare(right.id)
      );
    }
    return left.id.localeCompare(right.id);
  });

  const outcomeFacts: ReportOutcomeFact[] = sortedOutcomes.map((outcome) => {
    const node = nodesById.get(outcome.nodeId);
    // Guaranteed present by the referential check above.
    const title = node === undefined ? '' : node.title;
    // Missing optional metadata stays missing: keys are only set when the
    // domain record carries a value.
    const fact: ReportOutcomeFact = {
      kind: outcome.kind,
      nodeId: outcome.nodeId,
      origin: outcome.origin,
      title,
    };
    if (outcome.owner !== undefined) fact.owner = outcome.owner;
    if (outcome.dueDate !== undefined) fact.dueDate = outcome.dueDate;
    if (outcome.note !== undefined) fact.note = outcome.note;
    if (outcome.origin === 'LIVE') {
      if (outcome.markedAt !== undefined) fact.markedAt = outcome.markedAt;
      const formationPersonMinutes = formationCostByOutcomeId.get(outcome.id);
      if (formationPersonMinutes !== undefined) {
        fact.formationPersonMinutes = formationPersonMinutes;
      }
    }
    return fact;
  });

  const outcomeNodeIdsByKind = new Map<string, Set<string>>();
  for (const outcome of outcomes) {
    const bucket = outcomeNodeIdsByKind.get(outcome.kind) ?? new Set<string>();
    bucket.add(outcome.nodeId);
    outcomeNodeIdsByKind.set(outcome.kind, bucket);
  }
  const outcomeNodeIds = new Set(outcomes.map((outcome) => outcome.nodeId));

  const rootNode = graph.nodes.find((node) => node.kind === 'OBJECTIVE');
  // The locked brief states the goal when present; otherwise the objective
  // root node (the graph's fact source) carries it. Never synthesized.
  const briefObjective = meeting.brief?.objective.trim();
  const objective = briefObjective ? briefObjective : (rootNode?.title ?? meeting.title);

  return {
    ok: true,
    value: {
      attendeeCount: meeting.actualAttendeeCount,
      discussionTree: buildDiscussionTree(meeting, graph, outcomeNodeIds),
      mode: meeting.mode ?? 'GENERAL',
      modeFacts: buildModeFacts(meeting, graph, outcomeNodeIdsByKind),
      objective,
      outcomes: outcomeFacts,
      overtimeMinutes: economics.value.overtimeMinutes,
      parkingLot: nodeTitles(graph.nodes.filter((node) => node.kind === 'PARKING')),
      schedule: {
        actual: { end: meeting.endedAt, start: meeting.startedAt },
        planned: { end: meeting.scheduledEndAt, start: meeting.scheduledStartAt },
        timezone: context.timezone,
      },
      title: meeting.title,
      totalPersonMinutes: economics.value.totalPersonMinutes,
      unallocatedPersonMinutes: economics.value.unallocatedPersonMinutes,
      unknowns: [...(meeting.brief?.unknowns ?? [])],
    },
  };
}

/**
 * Project the full fact base down to exactly what docs/ai-contracts.md §9
 * allows the report model to see: no node ids, no mark times, no derived
 * totals beyond the contract fields.
 */
export function toReportAIFacts(facts: ReportFacts): ReportAIFacts {
  return {
    attendeeCount: facts.attendeeCount,
    mode: facts.mode,
    modeFacts: Object.fromEntries(
      Object.entries(facts.modeFacts).map(([key, values]) => [key, [...values]]),
    ),
    objective: facts.objective,
    outcomes: facts.outcomes.map((outcome) => {
      const projected: ReportAIOutcomeFact = {
        kind: outcome.kind,
        origin: outcome.origin,
        title: outcome.title,
      };
      if (outcome.note !== undefined) projected.note = outcome.note;
      if (outcome.owner !== undefined) projected.owner = outcome.owner;
      if (outcome.dueDate !== undefined) projected.dueDate = outcome.dueDate;
      if (outcome.formationPersonMinutes !== undefined) {
        projected.formationPersonMinutes = outcome.formationPersonMinutes;
      }
      return projected;
    }),
    overtimeMinutes: facts.overtimeMinutes,
    parkingLot: [...facts.parkingLot],
    schedule: {
      actual: { ...facts.schedule.actual },
      planned: { ...facts.schedule.planned },
      timezone: facts.schedule.timezone,
    },
    totalPersonMinutes: facts.totalPersonMinutes,
    unknowns: [...facts.unknowns],
  };
}
