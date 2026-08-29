import { isCanonicalUtcTimestamp, type Result } from '@/modules/shared';
import {
  meetingModes,
  meetingStatuses,
  outcomeKinds,
  preparationStages,
  readinessLevels,
  supportedLocales,
  validateGrillHistory,
  validateMeeting,
} from '@/modules/meeting-domain';
import type { GrillTurn, Meeting, MeetingOutcome } from '@/modules/meeting-domain';
import { nodeKinds, strategyIds, validateTree } from '@/modules/mind-map-domain';
import type { MindMapEdge, MindMapNode } from '@/modules/mind-map-domain';

import { exportSchemaVersion, type MeetingDatabase } from './database';
import {
  projectEdge,
  projectGrillTurn,
  projectMeeting,
  projectNode,
  projectOutcome,
} from './records';

export interface ConvergeneExportV1 {
  format: 'convergene-export';
  version: 1;
  exportedAt: string;
  meetings: Meeting[];
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  outcomes: MeetingOutcome[];
  grillTurns: GrillTurn[];
}

export type ExportErrorCode = 'INVALID_EXPORT';

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validBriefShape(brief: Meeting['brief']): boolean {
  return (
    brief !== undefined &&
    typeof brief.objective === 'string' &&
    typeof brief.desiredOutcome === 'string' &&
    stringArray(brief.confirmed) &&
    stringArray(brief.assumptions) &&
    stringArray(brief.unknowns) &&
    optionalString(brief.confirmedAt) &&
    brief.readiness !== null &&
    typeof brief.readiness === 'object' &&
    readinessLevels.includes(brief.readiness.level) &&
    Array.isArray(brief.readiness.dimensions) &&
    brief.readiness.dimensions.every(
      (dimension) =>
        dimension !== null &&
        typeof dimension === 'object' &&
        typeof dimension.key === 'string' &&
        (dimension.status === 'MISSING' ||
          dimension.status === 'PARTIAL' ||
          dimension.status === 'READY') &&
        optionalString(dimension.summary),
    ) &&
    brief.facilitation !== null &&
    typeof brief.facilitation === 'object' &&
    typeof brief.facilitation.openingLine === 'string' &&
    stringArray(brief.facilitation.closingChecklist)
  );
}

function validMeetingShape(meeting: Meeting): boolean {
  return (
    nonEmptyString(meeting.id) &&
    typeof meeting.title === 'string' &&
    typeof meeting.rawRequest === 'string' &&
    optionalString(meeting.mode) &&
    optionalString(meeting.modeReason) &&
    typeof meeting.status === 'string' &&
    typeof meeting.preparationStage === 'string' &&
    typeof meeting.contentLocale === 'string' &&
    typeof meeting.scheduledStartAt === 'string' &&
    typeof meeting.scheduledEndAt === 'string' &&
    typeof meeting.expectedAttendeeCount === 'number' &&
    (meeting.actualAttendeeCount === undefined ||
      typeof meeting.actualAttendeeCount === 'number') &&
    optionalString(meeting.startedAt) &&
    optionalString(meeting.endedAt) &&
    optionalString(meeting.activeTopicNodeId) &&
    (meeting.brief === undefined || validBriefShape(meeting.brief)) &&
    (meeting.report === undefined ||
      (meeting.report !== null &&
        typeof meeting.report === 'object' &&
        typeof meeting.report.locale === 'string' &&
        typeof meeting.report.markdown === 'string' &&
        typeof meeting.report.generatedAt === 'string' &&
        typeof meeting.report.sourceUpdatedAt === 'string' &&
        supportedLocales.includes(meeting.report.locale))) &&
    typeof meeting.createdAt === 'string' &&
    typeof meeting.updatedAt === 'string' &&
    (meeting.mode === undefined || meetingModes.includes(meeting.mode)) &&
    meetingStatuses.includes(meeting.status) &&
    preparationStages.includes(meeting.preparationStage) &&
    supportedLocales.includes(meeting.contentLocale)
  );
}

function validNodeShape(node: MindMapNode): boolean {
  const suggestion = node.parentSuggestion;
  return (
    nonEmptyString(node.id) &&
    nonEmptyString(node.meetingId) &&
    nodeKinds.includes(node.kind) &&
    typeof node.title === 'string' &&
    optionalString(node.note) &&
    node.position !== null &&
    typeof node.position === 'object' &&
    Number.isFinite(node.position.x) &&
    Number.isFinite(node.position.y) &&
    (node.source === 'USER' ||
      node.source === 'INITIAL_AI' ||
      node.source === 'EXPANSION_AI' ||
      node.source === 'QUICK_NOTE') &&
    (node.strategyId === undefined || strategyIds.includes(node.strategyId)) &&
    optionalString(node.topicPrompt) &&
    optionalString(node.transitionHint) &&
    typeof node.createdAt === 'string' &&
    typeof node.updatedAt === 'string' &&
    (suggestion === undefined ||
      (suggestion !== null &&
        typeof suggestion === 'object' &&
        nonEmptyString(suggestion.recommendedParentNodeId) &&
        stringArray(suggestion.alternativeParentNodeIds) &&
        typeof suggestion.rationale === 'string' &&
        typeof suggestion.createdAt === 'string'))
  );
}

function validEdgeShape(edge: MindMapEdge): boolean {
  return (
    nonEmptyString(edge.id) &&
    nonEmptyString(edge.meetingId) &&
    nonEmptyString(edge.sourceNodeId) &&
    nonEmptyString(edge.targetNodeId) &&
    edge.kind === 'CONTAINS' &&
    (edge.order === undefined || (Number.isInteger(edge.order) && edge.order >= 0))
  );
}

function validOutcomeShape(outcome: MeetingOutcome): boolean {
  return (
    nonEmptyString(outcome.id) &&
    nonEmptyString(outcome.meetingId) &&
    nonEmptyString(outcome.nodeId) &&
    outcomeKinds.includes(outcome.kind) &&
    (outcome.origin === 'LIVE' || outcome.origin === 'POST_MEETING') &&
    optionalString(outcome.markedAt) &&
    optionalString(outcome.owner) &&
    optionalString(outcome.dueDate) &&
    optionalString(outcome.note) &&
    (outcome.kind === 'ACTION' || (outcome.owner === undefined && outcome.dueDate === undefined))
  );
}

function validOutcomeTime(outcome: MeetingOutcome, meeting: Meeting, exportedAt: string): boolean {
  if (outcome.origin === 'POST_MEETING') {
    return outcome.markedAt === undefined && meeting.status === 'ENDED';
  }
  if (
    !isCanonicalUtcTimestamp(outcome.markedAt) ||
    !isCanonicalUtcTimestamp(meeting.startedAt) ||
    Date.parse(outcome.markedAt) < Date.parse(meeting.startedAt) ||
    Date.parse(outcome.markedAt) > Date.parse(meeting.updatedAt) ||
    Date.parse(outcome.markedAt) > Date.parse(exportedAt)
  ) {
    return false;
  }
  return (
    meeting.endedAt === undefined ||
    (isCanonicalUtcTimestamp(meeting.endedAt) &&
      Date.parse(outcome.markedAt) <= Date.parse(meeting.endedAt))
  );
}

function validReferences(snapshot: ConvergeneExportV1): boolean {
  const meetingIds = new Set(snapshot.meetings.map((meeting) => meeting.id));
  const meetingsById = new Map(snapshot.meetings.map((meeting) => [meeting.id, meeting]));
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));

  return (
    meetingIds.size === snapshot.meetings.length &&
    snapshot.meetings.every(
      (meeting) => validMeetingShape(meeting) && validateMeeting(meeting).ok,
    ) &&
    snapshot.nodes.every((node) => validNodeShape(node) && meetingIds.has(node.meetingId)) &&
    snapshot.edges.every((edge) => {
      if (!validEdgeShape(edge)) return false;
      const source = nodesById.get(edge.sourceNodeId);
      const target = nodesById.get(edge.targetNodeId);
      return (
        meetingIds.has(edge.meetingId) &&
        source?.meetingId === edge.meetingId &&
        target?.meetingId === edge.meetingId
      );
    }) &&
    snapshot.outcomes.every((outcome) => {
      if (!validOutcomeShape(outcome)) return false;
      const node = nodesById.get(outcome.nodeId);
      const meeting = meetingsById.get(outcome.meetingId);
      return (
        meeting !== undefined &&
        node?.meetingId === outcome.meetingId &&
        validOutcomeTime(outcome, meeting, snapshot.exportedAt)
      );
    }) &&
    snapshot.grillTurns.every(
      (turn) => meetingIds.has(turn.meetingId) && isCanonicalUtcTimestamp(turn.createdAt),
    ) &&
    snapshot.meetings.every((meeting) => {
      const graph = {
        edges: snapshot.edges.filter((edge) => edge.meetingId === meeting.id),
        meetingId: meeting.id,
        nodes: snapshot.nodes.filter((node) => node.meetingId === meeting.id),
      };
      const meetingGrillTurns = snapshot.grillTurns.filter((turn) => turn.meetingId === meeting.id);
      if (meeting.preparationStage === 'DRAFT' && meetingGrillTurns.length > 0) {
        return false;
      }
      if (
        meetingGrillTurns.length > 0 &&
        (meeting.mode === undefined || !validateGrillHistory(meetingGrillTurns, meeting.mode).ok)
      ) {
        return false;
      }
      if (
        meeting.preparationStage !== 'MAP_READY' &&
        (graph.nodes.length > 0 || graph.edges.length > 0)
      ) {
        return false;
      }
      const requiresGraph =
        meeting.preparationStage === 'MAP_READY' || meeting.status !== 'PREPARING';
      if (graph.nodes.length === 0) {
        return (
          !requiresGraph && graph.edges.length === 0 && meeting.activeTopicNodeId === undefined
        );
      }

      const validation = validateTree(graph);
      if (!validation.ok) return false;
      if (
        meeting.activeTopicNodeId !== undefined &&
        !validation.value.topicNodeIds.includes(meeting.activeTopicNodeId)
      ) {
        return false;
      }
      return meeting.status !== 'LIVE' || meeting.activeTopicNodeId !== undefined;
    })
  );
}

export async function createExportSnapshot(
  database: MeetingDatabase,
  now: Date,
): Promise<Result<ConvergeneExportV1, ExportErrorCode>> {
  const nowSnapshot = new Date(now.getTime());
  if (!Number.isFinite(nowSnapshot.getTime())) {
    return { error: { code: 'INVALID_EXPORT' }, ok: false };
  }

  let snapshot: ConvergeneExportV1;
  try {
    snapshot = await database.transaction(
      'r',
      [database.meetings, database.nodes, database.edges, database.outcomes, database.grillTurns],
      async (): Promise<ConvergeneExportV1> => {
        const [meetings, nodes, edges, outcomes, grillTurns] = await Promise.all([
          database.meetings.toArray(),
          database.nodes.toArray(),
          database.edges.toArray(),
          database.outcomes.toArray(),
          database.grillTurns.toArray(),
        ]);

        return {
          edges: edges.map(projectEdge).sort((left, right) => left.id.localeCompare(right.id)),
          exportedAt: nowSnapshot.toISOString(),
          format: 'convergene-export',
          grillTurns: grillTurns
            .map(projectGrillTurn)
            .sort(
              (left, right) =>
                left.meetingId.localeCompare(right.meetingId) || left.index - right.index,
            ),
          meetings: meetings
            .map(projectMeeting)
            .sort((left, right) => left.id.localeCompare(right.id)),
          nodes: nodes.map(projectNode).sort((left, right) => left.id.localeCompare(right.id)),
          outcomes: outcomes
            .map(projectOutcome)
            .sort((left, right) => left.id.localeCompare(right.id)),
          version: exportSchemaVersion,
        };
      },
    );
  } catch {
    return { error: { code: 'INVALID_EXPORT' }, ok: false };
  }

  try {
    return validReferences(snapshot)
      ? { ok: true, value: snapshot }
      : { error: { code: 'INVALID_EXPORT' }, ok: false };
  } catch {
    return { error: { code: 'INVALID_EXPORT' }, ok: false };
  }
}

export function serializeExport(snapshot: ConvergeneExportV1): string {
  return JSON.stringify(snapshot, undefined, 2);
}

export function exportFilename(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError('now must be a valid date');
  return `convergene-export-${now.toISOString().slice(0, 10)}.json`;
}
