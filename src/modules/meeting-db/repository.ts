import { isCanonicalUtcTimestamp, type Result } from '@/modules/shared';
import {
  completeGrill,
  confirmBrief as confirmMeetingBrief,
  confirmMeetingMode,
  correctMeetingEndTime,
  endMeeting,
  markMapReady,
  markOutcome,
  restartPreparation,
  resumeGrill,
  startMeeting,
  validateMeeting,
} from '@/modules/meeting-domain';
import type {
  GrillTurn,
  MarkOutcomeInput,
  Meeting,
  MeetingBriefDraft,
  MeetingDomainErrorCode,
  MeetingOutcome,
  MeetingReport,
  SupportedLocale,
} from '@/modules/meeting-domain';
import {
  applyExpansion,
  orderedTopicIds,
  reparentNode,
  validateInitialMap,
  validateTree,
} from '@/modules/mind-map-domain';
import type {
  ExpansionChild,
  GraphErrorCode,
  MeetingGraph,
  MindMapNode,
} from '@/modules/mind-map-domain';

import { exportSchemaVersion, type MeetingDatabase } from './database';
import {
  readMeetingAggregate,
  readMeetings,
  type MeetingAggregate,
  type MeetingReadErrorCode,
} from './read';
import {
  projectEdge,
  projectExpansionChild,
  projectGraph,
  projectGrillTurn,
  projectMeeting,
  projectMeetingReport,
  projectNode,
  projectOutcome,
} from './records';

export interface MeetingSetupPatch {
  contentLocale?: SupportedLocale;
  expectedAttendeeCount?: number;
  rawRequest?: string;
  scheduledEndAt?: string;
  scheduledStartAt?: string;
  title?: string;
}

export interface NodeTextPatch {
  note?: string;
  title: string;
}

export interface OutcomeMetadataPatch {
  dueDate?: string;
  note?: string;
  owner?: string;
}

export interface GrillTurnWrite {
  meeting: Meeting;
  turn: GrillTurn;
}

export type MeetingRepositoryErrorCode =
  | GraphErrorCode
  | MeetingDomainErrorCode
  | 'GRILL_TURN_ALREADY_EXISTS'
  | 'DANGLING_REFERENCE'
  | 'INVALID_GRILL_TURN'
  | 'MEETING_ALREADY_EXISTS'
  | 'MEETING_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'STALE_WRITE';

function failure(code: MeetingRepositoryErrorCode): Result<never, MeetingRepositoryErrorCode> {
  return { error: { code }, ok: false };
}

function deepSnapshot<T extends object>(value: T): T | undefined {
  try {
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeProject<T extends object, TProjected>(
  value: T,
  projector: (snapshot: T) => TProjected,
): TProjected | undefined {
  const snapshot = deepSnapshot(value);
  if (snapshot === undefined) return undefined;
  try {
    return projector(snapshot);
  } catch {
    return undefined;
  }
}

function validProjectedMeeting(value: Meeting): Meeting | undefined {
  const projected = safeProject(value, projectMeeting);
  return projected !== undefined && validateMeeting(projected).ok ? projected : undefined;
}

function graphError<T>(
  result: Result<T, GraphErrorCode>,
): Result<never, MeetingRepositoryErrorCode> {
  if (result.ok) throw new Error('graphError requires a failed result');
  return { error: result.error, ok: false };
}

function validNextRevision(
  meeting: Meeting,
  expectedUpdatedAt: string,
  now: Date,
): Result<string, MeetingRepositoryErrorCode> {
  if (meeting.updatedAt !== expectedUpdatedAt) return failure('STALE_WRITE');
  const currentRevision = Date.parse(meeting.updatedAt);
  if (
    !Number.isFinite(now.getTime()) ||
    !isCanonicalUtcTimestamp(meeting.updatedAt) ||
    !Number.isFinite(currentRevision)
  ) {
    return failure('INVALID_TIME_RANGE');
  }
  return { ok: true, value: new Date(Math.max(now.getTime(), currentRevision + 1)).toISOString() };
}

function sameMeeting(left: Meeting, right: Meeting): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.rawRequest === right.rawRequest &&
    left.mode === right.mode &&
    left.modeReason === right.modeReason &&
    left.status === right.status &&
    left.preparationStage === right.preparationStage &&
    left.contentLocale === right.contentLocale &&
    left.scheduledStartAt === right.scheduledStartAt &&
    left.scheduledEndAt === right.scheduledEndAt &&
    left.expectedAttendeeCount === right.expectedAttendeeCount &&
    left.actualAttendeeCount === right.actualAttendeeCount &&
    left.startedAt === right.startedAt &&
    left.endedAt === right.endedAt &&
    left.activeTopicNodeId === right.activeTopicNodeId &&
    JSON.stringify(left.brief) === JSON.stringify(right.brief) &&
    JSON.stringify(left.report) === JSON.stringify(right.report) &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

function validLiveOutcomeEnd(outcomes: readonly MeetingOutcome[], endedAt: Date): boolean {
  return outcomes
    .filter((outcome) => outcome.origin === 'LIVE')
    .every(
      (outcome) =>
        isCanonicalUtcTimestamp(outcome.markedAt) &&
        Date.parse(outcome.markedAt) <= endedAt.getTime(),
    );
}

export class MeetingRepository {
  constructor(private readonly database: MeetingDatabase) {}

  async createMeeting(meeting: Meeting): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const snapshot = validProjectedMeeting(meeting);
    if (snapshot === undefined) return failure('INVALID_MEETING');
    if (snapshot.status !== 'PREPARING' || snapshot.preparationStage !== 'DRAFT') {
      return failure('INVALID_MEETING_STATE');
    }

    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.appState],
      async () => {
        if ((await this.database.meetings.get(snapshot.id)) !== undefined) {
          return failure('MEETING_ALREADY_EXISTS');
        }

        await this.database.meetings.add(snapshot);
        await this.database.appState.put({
          key: 'exportSchemaVersion',
          value: exportSchemaVersion,
        });
        return { ok: true, value: snapshot };
      },
    );
  }

  async updateMeetingSetup(
    meetingId: string,
    patch: MeetingSetupPatch,
    expectedUpdatedAt: string,
    now: Date,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const patchSnapshot = deepSnapshot(patch);
    if (patchSnapshot === undefined) return failure('INVALID_MEETING');
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction('rw', this.database.meetings, async () => {
      const current = await this.database.meetings.get(meetingId);
      if (current === undefined) return failure('MEETING_NOT_FOUND');
      if (current.status !== 'PREPARING') return failure('INVALID_MEETING_STATE');
      if (
        current.preparationStage !== 'DRAFT' &&
        ((patchSnapshot.rawRequest !== undefined &&
          patchSnapshot.rawRequest !== current.rawRequest) ||
          (patchSnapshot.contentLocale !== undefined &&
            patchSnapshot.contentLocale !== current.contentLocale))
      ) {
        return failure('INVALID_MEETING_STATE');
      }

      const revision = validNextRevision(current, expectedUpdatedAt, nowSnapshot);
      if (!revision.ok) return revision;

      const candidate: Meeting = {
        ...current,
        contentLocale: patchSnapshot.contentLocale ?? current.contentLocale,
        expectedAttendeeCount: patchSnapshot.expectedAttendeeCount ?? current.expectedAttendeeCount,
        rawRequest: patchSnapshot.rawRequest ?? current.rawRequest,
        scheduledEndAt: patchSnapshot.scheduledEndAt ?? current.scheduledEndAt,
        scheduledStartAt: patchSnapshot.scheduledStartAt ?? current.scheduledStartAt,
        title: patchSnapshot.title ?? current.title,
        updatedAt: revision.value,
      };
      const value = validProjectedMeeting(candidate);
      if (value === undefined) return failure('INVALID_MEETING');
      const validation = validateMeeting(value);
      if (!validation.ok) return validation;

      await this.database.meetings.put(value);
      return { ok: true, value };
    });
  }

  async confirmBrief(
    meetingId: string,
    expectedUpdatedAt: string,
    now: Date,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction('rw', this.database.meetings, async () => {
      const current = await this.database.meetings.get(meetingId);
      if (current === undefined) return failure('MEETING_NOT_FOUND');

      const revision = validNextRevision(current, expectedUpdatedAt, nowSnapshot);
      if (!revision.ok) return revision;
      const confirmed = confirmMeetingBrief(current, new Date(revision.value));
      if (!confirmed.ok) return confirmed;
      const value = validProjectedMeeting(confirmed.value);
      if (value === undefined) return failure('INVALID_MEETING');

      await this.database.meetings.put(value);
      return { ok: true, value };
    });
  }

  async savePreparationTransition(
    meeting: Meeting,
    expectedUpdatedAt: string,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const snapshot = validProjectedMeeting(meeting);
    if (snapshot === undefined) return failure('INVALID_MEETING');

    return this.database.transaction(
      'rw',
      [
        this.database.meetings,
        this.database.nodes,
        this.database.edges,
        this.database.outcomes,
        this.database.grillTurns,
      ],
      async () => {
        const current = await this.database.meetings.get(snapshot.id);
        if (current === undefined) return failure('MEETING_NOT_FOUND');
        if (current.status !== 'PREPARING' || snapshot.status !== 'PREPARING') {
          return failure('INVALID_MEETING_STATE');
        }

        const requestedTransitionTime = new Date(snapshot.updatedAt);
        const revision = validNextRevision(current, expectedUpdatedAt, requestedTransitionTime);
        if (!revision.ok) return revision;
        const transitionTime = new Date(revision.value);
        const normalizedMeeting = { ...snapshot, updatedAt: revision.value };

        const transition = `${current.preparationStage}->${snapshot.preparationStage}`;
        let expected: Result<Meeting, MeetingDomainErrorCode>;
        if (transition === 'DRAFT->GRILLING' && snapshot.mode !== undefined) {
          expected = confirmMeetingMode(
            current,
            snapshot.mode,
            snapshot.modeReason,
            transitionTime,
          );
        } else if (
          transition === 'GRILLING->BRIEF_READY' &&
          snapshot.brief !== undefined &&
          snapshot.brief.confirmedAt === undefined
        ) {
          expected = completeGrill(current, snapshot.brief as MeetingBriefDraft, transitionTime);
        } else if (transition === 'BRIEF_READY->GRILLING' || transition === 'MAP_READY->GRILLING') {
          expected = resumeGrill(current, transitionTime);
        } else if (
          transition === 'GRILLING->DRAFT' ||
          transition === 'BRIEF_READY->DRAFT' ||
          transition === 'MAP_READY->DRAFT'
        ) {
          expected = restartPreparation(current, transitionTime);
        } else {
          return failure('INVALID_MEETING_STATE');
        }
        if (!expected.ok) return expected;
        const value = validProjectedMeeting(expected.value);
        if (value === undefined || !sameMeeting(value, normalizedMeeting)) {
          return failure('INVALID_MEETING_STATE');
        }

        if (snapshot.preparationStage === 'GRILLING' && current.preparationStage !== 'DRAFT') {
          await Promise.all([
            this.database.nodes.where('meetingId').equals(snapshot.id).delete(),
            this.database.edges.where('meetingId').equals(snapshot.id).delete(),
            this.database.outcomes.where('meetingId').equals(snapshot.id).delete(),
          ]);
        }

        if (snapshot.preparationStage === 'DRAFT') {
          await Promise.all([
            this.database.nodes.where('meetingId').equals(snapshot.id).delete(),
            this.database.edges.where('meetingId').equals(snapshot.id).delete(),
            this.database.outcomes.where('meetingId').equals(snapshot.id).delete(),
            this.database.grillTurns.where('meetingId').equals(snapshot.id).delete(),
          ]);
        }

        await this.database.meetings.put(value);
        return { ok: true, value };
      },
    );
  }

  async listMeetings(): Promise<Result<Meeting[], MeetingReadErrorCode>> {
    return readMeetings(this.database);
  }

  async getMeetingAggregate(
    meetingId: string,
  ): Promise<Result<MeetingAggregate | undefined, MeetingReadErrorCode>> {
    return readMeetingAggregate(this.database, meetingId);
  }

  async getActiveMeetingId(): Promise<string | undefined> {
    const active = await this.database.appState.get('activeMeetingId');
    if (typeof active?.value === 'string') return active.value;
    return (await this.database.meetings.where('status').equals('LIVE').first())?.id;
  }

  async startMeeting(
    meetingId: string,
    attendeeCount: number,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.nodes, this.database.edges, this.database.appState],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');

        const activeState = await this.getActiveMeetingId();
        const liveMeeting = await this.database.meetings.where('status').equals('LIVE').first();
        const activeMeetingId = activeState ?? liveMeeting?.id;
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const started = startMeeting(meeting, attendeeCount, nowSnapshot, activeMeetingId);
        if (!started.ok) return started;

        const graph: MeetingGraph = {
          edges: await this.database.edges.where('meetingId').equals(meetingId).toArray(),
          meetingId,
          nodes: await this.database.nodes.where('meetingId').equals(meetingId).toArray(),
        };
        const topics = orderedTopicIds(graph);
        if (!topics.ok) return graphError(topics);
        const firstTopicNodeId = topics.value[0];
        if (firstTopicNodeId === undefined) return failure('INVALID_TOPIC');

        const value = validProjectedMeeting({
          ...started.value,
          activeTopicNodeId: firstTopicNodeId,
          updatedAt: revision.value,
        });
        if (value === undefined) return failure('INVALID_MEETING');
        await this.database.meetings.put(value);
        await this.database.appState.put({ key: 'activeMeetingId', value: meetingId });
        await this.database.appState.put({
          key: 'exportSchemaVersion',
          value: exportSchemaVersion,
        });
        return { ok: true, value };
      },
    );
  }

  async endMeeting(
    meetingId: string,
    expectedMeetingUpdatedAt: string,
    now: Date,
    attendeeCount?: number,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.outcomes, this.database.appState],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const ended = endMeeting(meeting, nowSnapshot, attendeeCount);
        if (!ended.ok) return ended;
        const outcomes = await this.database.outcomes
          .where('meetingId')
          .equals(meetingId)
          .toArray();
        if (!validLiveOutcomeEnd(outcomes, nowSnapshot)) return failure('INVALID_TIME_RANGE');

        const value = validProjectedMeeting({ ...ended.value, updatedAt: revision.value });
        if (value === undefined) return failure('INVALID_MEETING');
        await this.database.meetings.put(value);
        if ((await this.getActiveMeetingId()) === meetingId) {
          await this.database.appState.delete('activeMeetingId');
        }
        return { ok: true, value };
      },
    );
  }

  async correctMeetingEndTime(
    meetingId: string,
    correctedEnd: Date,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const correctedEndSnapshot = new Date(correctedEnd.getTime());
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.outcomes],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const corrected = correctMeetingEndTime(meeting, correctedEndSnapshot, nowSnapshot);
        if (!corrected.ok) return corrected;

        const outcomes = await this.database.outcomes
          .where('meetingId')
          .equals(meetingId)
          .toArray();
        if (!validLiveOutcomeEnd(outcomes, correctedEndSnapshot)) {
          return failure('INVALID_TIME_RANGE');
        }

        const value = validProjectedMeeting({ ...corrected.value, updatedAt: revision.value });
        if (value === undefined) return failure('INVALID_MEETING');
        await this.database.meetings.put(value);
        return { ok: true, value };
      },
    );
  }

  async saveInitialGraph(
    graph: MeetingGraph,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingGraph, MeetingRepositoryErrorCode>> {
    const snapshot = safeProject(graph, projectGraph);
    if (snapshot === undefined) return failure('INVALID_EDGE');
    const nowSnapshot = new Date(now.getTime());
    const validation = validateInitialMap(snapshot);
    if (!validation.ok) return graphError(validation);

    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.nodes, this.database.edges],
      async () => {
        const meeting = await this.database.meetings.get(snapshot.meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const mapReady = markMapReady(meeting, new Date(revision.value));
        if (!mapReady.ok) return mapReady;
        const meetingValue = validProjectedMeeting(mapReady.value);
        if (meetingValue === undefined) return failure('INVALID_MEETING');

        await this.database.nodes.where('meetingId').equals(snapshot.meetingId).delete();
        await this.database.edges.where('meetingId').equals(snapshot.meetingId).delete();
        await this.database.nodes.bulkAdd(snapshot.nodes);
        await this.database.edges.bulkAdd(snapshot.edges);
        await this.database.meetings.put(meetingValue);
        return { ok: true, value: snapshot };
      },
    );
  }

  async replaceGraph(
    graph: MeetingGraph,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingGraph, MeetingRepositoryErrorCode>> {
    const snapshot = safeProject(graph, projectGraph);
    if (snapshot === undefined) return failure('INVALID_EDGE');
    const nowSnapshot = new Date(now.getTime());
    const validation = validateTree(snapshot);
    if (!validation.ok) return graphError(validation);

    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.nodes, this.database.edges, this.database.outcomes],
      async () => {
        const meeting = await this.database.meetings.get(snapshot.meetingId);
        if (meeting === undefined) {
          return failure('MEETING_NOT_FOUND');
        }
        if (meeting.preparationStage !== 'MAP_READY' || meeting.status === 'ENDED') {
          return failure('INVALID_MEETING_STATE');
        }

        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const topicIds = orderedTopicIds(snapshot);
        if (!topicIds.ok) return graphError(topicIds);
        const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
        const outcomes = await this.database.outcomes
          .where('meetingId')
          .equals(snapshot.meetingId)
          .toArray();
        if (
          (meeting.activeTopicNodeId !== undefined &&
            !topicIds.value.includes(meeting.activeTopicNodeId)) ||
          outcomes.some((outcome) => !nodeIds.has(outcome.nodeId))
        ) {
          return failure('DANGLING_REFERENCE');
        }
        const meetingValue = validProjectedMeeting({ ...meeting, updatedAt: revision.value });
        if (meetingValue === undefined) return failure('INVALID_MEETING');

        await this.database.nodes.where('meetingId').equals(snapshot.meetingId).delete();
        await this.database.edges.where('meetingId').equals(snapshot.meetingId).delete();
        await this.database.nodes.bulkAdd(snapshot.nodes);
        await this.database.edges.bulkAdd(snapshot.edges);
        await this.database.meetings.put(meetingValue);
        return { ok: true, value: snapshot };
      },
    );
  }

  async applyExpansion(
    meetingId: string,
    parentNodeId: string,
    children: readonly ExpansionChild[],
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingGraph, MeetingRepositoryErrorCode>> {
    const childrenSnapshot = safeProject([...children], (snapshot) =>
      snapshot.map(projectExpansionChild),
    );
    if (childrenSnapshot === undefined) return failure('INVALID_EXPANSION');
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.nodes, this.database.edges],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) {
          return failure('MEETING_NOT_FOUND');
        }
        if (meeting.preparationStage !== 'MAP_READY' || meeting.status === 'ENDED') {
          return failure('INVALID_MEETING_STATE');
        }
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;

        const graph: MeetingGraph = {
          edges: await this.database.edges.where('meetingId').equals(meetingId).toArray(),
          meetingId,
          nodes: await this.database.nodes.where('meetingId').equals(meetingId).toArray(),
        };
        const expanded = applyExpansion(graph, parentNodeId, childrenSnapshot);
        if (!expanded.ok) return graphError(expanded);
        const meetingValue = validProjectedMeeting({ ...meeting, updatedAt: revision.value });
        if (meetingValue === undefined) return failure('INVALID_MEETING');

        await this.database.nodes.bulkAdd(childrenSnapshot.map(({ node }) => projectNode(node)));
        await this.database.edges.bulkAdd(
          childrenSnapshot.map(({ edgeId, node, order }) =>
            projectEdge({
              id: edgeId,
              kind: 'CONTAINS' as const,
              meetingId,
              order,
              sourceNodeId: parentNodeId,
              targetNodeId: node.id,
            }),
          ),
        );
        await this.database.meetings.put(meetingValue);
        return expanded;
      },
    );
  }

  async reparentNode(
    meetingId: string,
    nodeId: string,
    parentNodeId: string,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingGraph, MeetingRepositoryErrorCode>> {
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.nodes, this.database.edges],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        if (meeting.preparationStage !== 'MAP_READY' || meeting.status === 'ENDED') {
          return failure('INVALID_MEETING_STATE');
        }
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const graph: MeetingGraph = {
          edges: await this.database.edges.where('meetingId').equals(meetingId).toArray(),
          meetingId,
          nodes: await this.database.nodes.where('meetingId').equals(meetingId).toArray(),
        };
        const reparented = reparentNode(graph, nodeId, parentNodeId);
        if (!reparented.ok) return graphError(reparented);
        const topicIds = orderedTopicIds(reparented.value);
        if (!topicIds.ok) return graphError(topicIds);
        if (
          meeting.activeTopicNodeId !== undefined &&
          !topicIds.value.includes(meeting.activeTopicNodeId)
        ) {
          return failure('DANGLING_REFERENCE');
        }
        const meetingValue = validProjectedMeeting({ ...meeting, updatedAt: revision.value });
        if (meetingValue === undefined) return failure('INVALID_MEETING');
        await this.database.edges.bulkPut(reparented.value.edges.map(projectEdge));
        await this.database.meetings.put(meetingValue);
        return reparented;
      },
    );
  }

  async updateNodeText(
    meetingId: string,
    nodeId: string,
    patch: NodeTextPatch,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<MindMapNode, MeetingRepositoryErrorCode>> {
    const patchSnapshot = deepSnapshot(patch);
    if (patchSnapshot === undefined) return failure('INVALID_TITLE');
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.nodes, this.database.edges],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        if (meeting.preparationStage !== 'MAP_READY') return failure('INVALID_MEETING_STATE');
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;

        const [nodes, edges] = await Promise.all([
          this.database.nodes.where('meetingId').equals(meetingId).toArray(),
          this.database.edges.where('meetingId').equals(meetingId).toArray(),
        ]);
        const current = nodes.find((node) => node.id === nodeId);
        if (current === undefined) return failure('NODE_NOT_FOUND');
        const value = projectNode({
          ...current,
          note: patchSnapshot.note,
          title: patchSnapshot.title,
          updatedAt: revision.value,
        });
        const graphValidation = validateTree({
          edges,
          meetingId,
          nodes: nodes.map((node) => (node.id === nodeId ? value : node)),
        });
        if (!graphValidation.ok) return graphError(graphValidation);
        const meetingValue = validProjectedMeeting({ ...meeting, updatedAt: revision.value });
        if (meetingValue === undefined) return failure('INVALID_MEETING');

        await this.database.nodes.put(value);
        await this.database.meetings.put(meetingValue);
        return { ok: true, value };
      },
    );
  }

  async markOutcome(
    meetingId: string,
    input: MarkOutcomeInput,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingOutcome, MeetingRepositoryErrorCode>> {
    const rawInput = deepSnapshot(input);
    if (rawInput === undefined) return failure('INVALID_OUTCOME');
    const inputSnapshot: MarkOutcomeInput = {
      dueDate: rawInput.dueDate,
      id: rawInput.id,
      kind: rawInput.kind,
      nodeId: rawInput.nodeId,
      note: rawInput.note,
      owner: rawInput.owner,
    };
    const nowSnapshot = new Date(now.getTime());
    try {
      return await this.database.transaction(
        'rw',
        [this.database.meetings, this.database.nodes, this.database.outcomes],
        async () => {
          const meeting = await this.database.meetings.get(meetingId);
          if (meeting === undefined) return failure('MEETING_NOT_FOUND');
          const node = await this.database.nodes.get(inputSnapshot.nodeId);
          if (node?.meetingId !== meetingId) return failure('NODE_NOT_FOUND');
          const outcomes = await this.database.outcomes
            .where('meetingId')
            .equals(meetingId)
            .toArray();
          const outcome = markOutcome(meeting, outcomes, inputSnapshot, nowSnapshot);
          if (!outcome.ok) return outcome;
          const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
          if (!revision.ok) return revision;
          const outcomeValue = projectOutcome(outcome.value);
          const meetingValue = validProjectedMeeting({ ...meeting, updatedAt: revision.value });
          if (meetingValue === undefined) return failure('INVALID_MEETING');
          await this.database.outcomes.add(outcomeValue);
          await this.database.meetings.put(meetingValue);
          return { ok: true, value: outcomeValue };
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConstraintError') {
        return failure('OUTCOME_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async unmarkOutcome(
    meetingId: string,
    outcomeId: string,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingOutcome, MeetingRepositoryErrorCode>> {
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.outcomes],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        if (meeting.status === 'PREPARING') return failure('INVALID_MEETING_STATE');
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const outcome = await this.database.outcomes.get(outcomeId);
        if (outcome?.meetingId !== meetingId) return failure('INVALID_OUTCOME');
        const outcomeValue = projectOutcome(outcome);
        const meetingValue = validProjectedMeeting({ ...meeting, updatedAt: revision.value });
        if (meetingValue === undefined) return failure('INVALID_MEETING');
        await this.database.outcomes.delete(outcomeId);
        await this.database.meetings.put(meetingValue);
        return { ok: true, value: outcomeValue };
      },
    );
  }

  async updateOutcomeMetadata(
    meetingId: string,
    outcomeId: string,
    patch: OutcomeMetadataPatch,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingOutcome, MeetingRepositoryErrorCode>> {
    const patchSnapshot = deepSnapshot(patch);
    if (
      patchSnapshot === undefined ||
      patchSnapshot === null ||
      typeof patchSnapshot !== 'object' ||
      Array.isArray(patchSnapshot)
    ) {
      return failure('INVALID_OUTCOME');
    }
    const patchesDueDate = hasOwn(patchSnapshot, 'dueDate');
    const patchesNote = hasOwn(patchSnapshot, 'note');
    const patchesOwner = hasOwn(patchSnapshot, 'owner');
    if (
      (patchSnapshot.owner !== undefined && typeof patchSnapshot.owner !== 'string') ||
      (patchSnapshot.dueDate !== undefined && typeof patchSnapshot.dueDate !== 'string') ||
      (patchSnapshot.note !== undefined && typeof patchSnapshot.note !== 'string')
    ) {
      return failure('INVALID_OUTCOME');
    }
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.outcomes],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        if (meeting.status === 'PREPARING') return failure('INVALID_MEETING_STATE');
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const outcome = await this.database.outcomes.get(outcomeId);
        if (outcome?.meetingId !== meetingId) return failure('INVALID_OUTCOME');
        if (
          outcome.kind !== 'ACTION' &&
          ((patchesOwner && patchSnapshot.owner !== undefined) ||
            (patchesDueDate && patchSnapshot.dueDate !== undefined))
        ) {
          return failure('INVALID_OUTCOME');
        }

        const value = projectOutcome({
          dueDate: patchesDueDate ? patchSnapshot.dueDate : outcome.dueDate,
          id: outcome.id,
          kind: outcome.kind,
          markedAt: outcome.markedAt,
          meetingId: outcome.meetingId,
          nodeId: outcome.nodeId,
          note: patchesNote ? patchSnapshot.note : outcome.note,
          origin: outcome.origin,
          owner: patchesOwner ? patchSnapshot.owner : outcome.owner,
        });
        const meetingValue = validProjectedMeeting({ ...meeting, updatedAt: revision.value });
        if (meetingValue === undefined) return failure('INVALID_MEETING');
        await this.database.outcomes.put(value);
        await this.database.meetings.put(meetingValue);
        return { ok: true, value };
      },
    );
  }

  async putGrillTurn(
    turn: GrillTurn,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<GrillTurnWrite, MeetingRepositoryErrorCode>> {
    const snapshot = safeProject(turn, projectGrillTurn);
    if (snapshot === undefined) return failure('INVALID_GRILL_TURN');
    if (
      typeof snapshot.id !== 'string' ||
      snapshot.id.trim() === '' ||
      typeof snapshot.meetingId !== 'string' ||
      snapshot.meetingId.trim() === '' ||
      typeof snapshot.question !== 'string' ||
      snapshot.question.trim() === '' ||
      !Number.isInteger(snapshot.index) ||
      snapshot.index < 0 ||
      snapshot.index > 9 ||
      (snapshot.reason !== undefined && typeof snapshot.reason !== 'string') ||
      (snapshot.answer !== undefined && typeof snapshot.answer !== 'string') ||
      (snapshot.disposition !== 'ANSWERED' &&
        snapshot.disposition !== 'UNKNOWN' &&
        snapshot.disposition !== 'SKIPPED') ||
      !isCanonicalUtcTimestamp(snapshot.createdAt)
    ) {
      return failure('INVALID_GRILL_TURN');
    }
    const nowSnapshot = new Date(now.getTime());

    try {
      return await this.database.transaction(
        'rw',
        [this.database.meetings, this.database.grillTurns],
        async () => {
          const meeting = await this.database.meetings.get(snapshot.meetingId);
          if (meeting === undefined) return failure('MEETING_NOT_FOUND');
          if (meeting.status !== 'PREPARING' || meeting.preparationStage !== 'GRILLING') {
            return failure('INVALID_MEETING_STATE');
          }

          const sameId = await this.database.grillTurns.get(snapshot.id);
          if (
            sameId !== undefined &&
            (sameId.meetingId !== snapshot.meetingId || sameId.index !== snapshot.index)
          ) {
            return failure('GRILL_TURN_ALREADY_EXISTS');
          }
          const sameIndex = await this.database.grillTurns
            .where('[meetingId+index]')
            .equals([snapshot.meetingId, snapshot.index])
            .first();
          if (sameIndex !== undefined && sameIndex.id !== snapshot.id) {
            return failure('GRILL_TURN_ALREADY_EXISTS');
          }

          const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
          if (!revision.ok) return revision;
          const meetingValue = validProjectedMeeting({ ...meeting, updatedAt: revision.value });
          if (meetingValue === undefined) return failure('INVALID_MEETING');
          await this.database.grillTurns.put(snapshot);
          await this.database.meetings.put(meetingValue);
          return { ok: true, value: { meeting: meetingValue, turn: snapshot } };
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConstraintError') {
        return failure('GRILL_TURN_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async saveMeetingReport(
    meetingId: string,
    report: MeetingReport,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const reportSnapshot = safeProject(report, projectMeetingReport);
    if (reportSnapshot === undefined) return failure('INVALID_MEETING');
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.nodes, this.database.edges, this.database.outcomes],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        if (meeting.status !== 'ENDED') return failure('INVALID_MEETING_STATE');
        if (reportSnapshot.sourceUpdatedAt !== meeting.updatedAt) {
          return failure('STALE_WRITE');
        }
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        if (
          !isCanonicalUtcTimestamp(reportSnapshot.generatedAt) ||
          Date.parse(reportSnapshot.generatedAt) < Date.parse(reportSnapshot.sourceUpdatedAt) ||
          Date.parse(reportSnapshot.generatedAt) > nowSnapshot.getTime()
        ) {
          return failure('INVALID_TIME_RANGE');
        }
        const [nodes, edges, outcomes] = await Promise.all([
          this.database.nodes.where('meetingId').equals(meetingId).toArray(),
          this.database.edges.where('meetingId').equals(meetingId).toArray(),
          this.database.outcomes.where('meetingId').equals(meetingId).toArray(),
        ]);
        const graph = safeProject({ edges, meetingId, nodes }, projectGraph);
        if (graph === undefined) return failure('INVALID_EDGE');
        const topics = orderedTopicIds(graph);
        if (!topics.ok) return graphError(topics);
        const nodeIds = new Set(graph.nodes.map((node) => node.id));
        if (
          (meeting.activeTopicNodeId !== undefined &&
            !topics.value.includes(meeting.activeTopicNodeId)) ||
          outcomes.some((outcome) => !nodeIds.has(outcome.nodeId))
        ) {
          return failure('DANGLING_REFERENCE');
        }
        const committedReport: MeetingReport = {
          ...reportSnapshot,
          generatedAt: revision.value,
          sourceUpdatedAt: revision.value,
        };
        const value = validProjectedMeeting({
          ...meeting,
          report: committedReport,
          updatedAt: revision.value,
        });
        if (value === undefined) return failure('INVALID_MEETING');
        await this.database.meetings.put(value);
        return { ok: true, value };
      },
    );
  }

  async setActiveTopic(
    meetingId: string,
    topicNodeId: string,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>> {
    const nowSnapshot = new Date(now.getTime());
    return this.database.transaction(
      'rw',
      [this.database.meetings, this.database.nodes, this.database.edges],
      async () => {
        const meeting = await this.database.meetings.get(meetingId);
        if (meeting === undefined) return failure('MEETING_NOT_FOUND');
        if (meeting.status !== 'LIVE') return failure('INVALID_MEETING_STATE');
        const revision = validNextRevision(meeting, expectedMeetingUpdatedAt, nowSnapshot);
        if (!revision.ok) return revision;
        const graph = safeProject(
          {
            edges: await this.database.edges.where('meetingId').equals(meetingId).toArray(),
            meetingId,
            nodes: await this.database.nodes.where('meetingId').equals(meetingId).toArray(),
          },
          projectGraph,
        );
        if (graph === undefined) return failure('INVALID_EDGE');
        const topics = orderedTopicIds(graph);
        if (!topics.ok) return graphError(topics);
        if (!topics.value.includes(topicNodeId)) return failure('INVALID_TOPIC');
        const value = validProjectedMeeting({
          ...meeting,
          activeTopicNodeId: topicNodeId,
          updatedAt: revision.value,
        });
        if (value === undefined) return failure('INVALID_MEETING');
        await this.database.meetings.put(value);
        return { ok: true, value };
      },
    );
  }

  async deleteMeeting(meetingId: string): Promise<Result<string, MeetingRepositoryErrorCode>> {
    return this.database.transaction(
      'rw',
      [
        this.database.meetings,
        this.database.nodes,
        this.database.edges,
        this.database.outcomes,
        this.database.grillTurns,
        this.database.appState,
      ],
      async () => {
        if ((await this.database.meetings.get(meetingId)) === undefined) {
          return failure('MEETING_NOT_FOUND');
        }

        await Promise.all([
          this.database.nodes.where('meetingId').equals(meetingId).delete(),
          this.database.edges.where('meetingId').equals(meetingId).delete(),
          this.database.outcomes.where('meetingId').equals(meetingId).delete(),
          this.database.grillTurns.where('meetingId').equals(meetingId).delete(),
        ]);
        await this.database.meetings.delete(meetingId);
        if ((await this.getActiveMeetingId()) === meetingId) {
          await this.database.appState.delete('activeMeetingId');
        }
        return { ok: true, value: meetingId };
      },
    );
  }

  async clearAllMeetingData(): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.meetings,
        this.database.nodes,
        this.database.edges,
        this.database.outcomes,
        this.database.grillTurns,
        this.database.appState,
      ],
      async () => {
        await Promise.all([
          this.database.meetings.clear(),
          this.database.nodes.clear(),
          this.database.edges.clear(),
          this.database.outcomes.clear(),
          this.database.grillTurns.clear(),
          this.database.appState.clear(),
        ]);
      },
    );
  }
}
