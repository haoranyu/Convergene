import { isCanonicalUtcTimestamp, type Result } from '@/modules/shared';
import { outcomeKinds, validateGrillHistory, validateMeeting } from '@/modules/meeting-domain';
import type { GrillTurn, Meeting, MeetingOutcome } from '@/modules/meeting-domain';
import { validateTree } from '@/modules/mind-map-domain';
import type { MeetingGraph, MindMapEdge, MindMapNode } from '@/modules/mind-map-domain';

import type { MeetingDatabase } from './database';
import {
  projectEdge,
  projectGrillTurn,
  projectMeeting,
  projectNode,
  projectOutcome,
} from './records';

export interface MeetingAggregate {
  meeting: Meeting;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  outcomes: MeetingOutcome[];
  grillTurns: GrillTurn[];
}

/** A stable semantic-corruption result; storage failures still reject the read promise. */
export type MeetingReadErrorCode = 'INVALID_STORED_DATA';

export class MeetingReadError extends Error {
  readonly code = 'INVALID_STORED_DATA' as const;

  constructor() {
    super('Stored meeting data failed semantic validation');
    this.name = 'MeetingReadError';
  }
}

function failure<T>(): Result<T, MeetingReadErrorCode> {
  return { error: { code: 'INVALID_STORED_DATA' }, ok: false };
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function validOutcome(outcome: MeetingOutcome, meeting: Meeting, nodeIds: Set<string>): boolean {
  if (
    !nonEmptyString(outcome.id) ||
    outcome.meetingId !== meeting.id ||
    !nodeIds.has(outcome.nodeId) ||
    !outcomeKinds.includes(outcome.kind) ||
    (outcome.origin !== 'LIVE' && outcome.origin !== 'POST_MEETING') ||
    !optionalString(outcome.markedAt) ||
    !optionalString(outcome.owner) ||
    !optionalString(outcome.dueDate) ||
    !optionalString(outcome.note) ||
    (outcome.kind !== 'ACTION' && (outcome.owner !== undefined || outcome.dueDate !== undefined))
  ) {
    return false;
  }
  if (outcome.origin === 'POST_MEETING') {
    return meeting.status === 'ENDED' && outcome.markedAt === undefined;
  }
  if (
    meeting.status === 'PREPARING' ||
    !isCanonicalUtcTimestamp(meeting.startedAt) ||
    !isCanonicalUtcTimestamp(outcome.markedAt) ||
    Date.parse(outcome.markedAt) < Date.parse(meeting.startedAt) ||
    Date.parse(outcome.markedAt) > Date.parse(meeting.updatedAt)
  ) {
    return false;
  }
  return (
    meeting.endedAt === undefined ||
    (isCanonicalUtcTimestamp(meeting.endedAt) &&
      Date.parse(outcome.markedAt) <= Date.parse(meeting.endedAt))
  );
}

function projectAggregate(
  meetingRecord: Meeting,
  nodeRecords: MindMapNode[],
  edgeRecords: MindMapEdge[],
  outcomeRecords: MeetingOutcome[],
  grillTurnRecords: GrillTurn[],
): MeetingAggregate | undefined {
  try {
    const meeting = projectMeeting(meetingRecord);
    if (!validateMeeting(meeting).ok) return undefined;
    const nodes = nodeRecords.map(projectNode);
    const edges = edgeRecords.map(projectEdge);
    const outcomes = outcomeRecords.map(projectOutcome);
    const grillTurns = grillTurnRecords.map(projectGrillTurn);
    const graph: MeetingGraph = { edges, meetingId: meeting.id, nodes };

    if (meeting.preparationStage !== 'MAP_READY' && (nodes.length > 0 || edges.length > 0)) {
      return undefined;
    }
    const graphValidation =
      meeting.preparationStage === 'MAP_READY' ? validateTree(graph) : undefined;
    if (graphValidation !== undefined && !graphValidation.ok) return undefined;
    if (
      meeting.activeTopicNodeId !== undefined &&
      (graphValidation === undefined ||
        !graphValidation.value.topicNodeIds.includes(meeting.activeTopicNodeId))
    ) {
      return undefined;
    }
    if (meeting.status === 'LIVE' && meeting.activeTopicNodeId === undefined) return undefined;
    if (meeting.preparationStage === 'DRAFT' && grillTurns.length > 0) return undefined;

    const nodeIds = new Set(nodes.map((node) => node.id));
    if (
      !outcomes.every((outcome) => validOutcome(outcome, meeting, nodeIds)) ||
      (grillTurns.length > 0 &&
        (meeting.mode === undefined || !validateGrillHistory(grillTurns, meeting.mode).ok))
    ) {
      return undefined;
    }
    return { edges, grillTurns, meeting, nodes, outcomes };
  } catch {
    return undefined;
  }
}

export async function readMeetings(
  database: MeetingDatabase,
): Promise<Result<Meeting[], MeetingReadErrorCode>> {
  const records = await database.meetings.toArray();
  try {
    const meetings = records.map(projectMeeting);
    if (!meetings.every((meeting) => validateMeeting(meeting).ok)) return failure();
    meetings.sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? -1 : 1;
      if (left.id === right.id) return 0;
      return left.id < right.id ? -1 : 1;
    });
    return { ok: true, value: meetings };
  } catch {
    return failure();
  }
}

export async function readMeetingAggregate(
  database: MeetingDatabase,
  meetingId: string,
): Promise<Result<MeetingAggregate | undefined, MeetingReadErrorCode>> {
  return database.transaction(
    'r',
    [database.meetings, database.nodes, database.edges, database.outcomes, database.grillTurns],
    async () => {
      const meeting = await database.meetings.get(meetingId);
      if (meeting === undefined) return { ok: true, value: undefined };
      const [nodes, edges, outcomes, grillTurns] = await Promise.all([
        database.nodes.where('meetingId').equals(meetingId).toArray(),
        database.edges.where('meetingId').equals(meetingId).toArray(),
        database.outcomes.where('meetingId').equals(meetingId).toArray(),
        database.grillTurns.where('meetingId').equals(meetingId).sortBy('index'),
      ]);
      const aggregate = projectAggregate(meeting, nodes, edges, outcomes, grillTurns);
      return aggregate === undefined ? failure() : { ok: true, value: aggregate };
    },
  );
}
