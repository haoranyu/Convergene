import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { briefDraft } from '@/fixtures/meeting';

import {
  completeGrill,
  confirmMeetingMode,
  restartPreparation,
  resumeGrill,
} from '@/modules/meeting-domain';
import type { GrillTurn, Meeting } from '@/modules/meeting-domain';
import type { MeetingGraph, MindMapEdge, MindMapNode } from '@/modules/mind-map-domain';

import { MeetingDatabase } from './database';
import { createExportSnapshot, exportFilename, serializeExport } from './export';
import { observeMeetingAggregate, observeMeetings } from './observe';
import { MeetingRepository } from './repository';

const timestamp = '2026-08-29T09:30:00.000Z';
let databaseName: string;
let databases: MeetingDatabase[];

function openDatabase(): MeetingDatabase {
  const database = new MeetingDatabase(databaseName);
  databases.push(database);
  return database;
}

function meeting(id: string, overrides: Partial<Meeting> = {}): Meeting {
  return {
    contentLocale: 'en-US',
    createdAt: timestamp,
    expectedAttendeeCount: 4,
    id,
    preparationStage: 'DRAFT',
    rawRequest: 'Choose a launch plan',
    scheduledEndAt: '2026-08-29T11:00:00.000Z',
    scheduledStartAt: '2026-08-29T10:00:00.000Z',
    status: 'PREPARING',
    title: `Launch decision ${id}`,
    updatedAt: timestamp,
    ...overrides,
  };
}

function node(
  meetingId: string,
  id: string,
  kind: MindMapNode['kind'],
  title: string,
  extra: Partial<MindMapNode> = {},
): MindMapNode {
  return {
    createdAt: timestamp,
    id,
    kind,
    meetingId,
    position: { x: 0, y: 0 },
    source: 'INITIAL_AI',
    title,
    updatedAt: timestamp,
    ...extra,
  };
}

function edge(
  meetingId: string,
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  order?: number,
): MindMapEdge {
  return { id, kind: 'CONTAINS', meetingId, order, sourceNodeId, targetNodeId };
}

function graph(meetingId: string): MeetingGraph {
  const rootId = `${meetingId}-root`;
  return {
    edges: [
      edge(meetingId, `${meetingId}-edge-1`, rootId, `${meetingId}-topic-1`, 0),
      edge(meetingId, `${meetingId}-edge-2`, rootId, `${meetingId}-topic-2`, 1),
      edge(meetingId, `${meetingId}-edge-3`, rootId, `${meetingId}-topic-3`, 2),
      edge(meetingId, `${meetingId}-edge-detail`, `${meetingId}-topic-1`, `${meetingId}-detail`),
    ],
    meetingId,
    nodes: [
      node(meetingId, rootId, 'OBJECTIVE', 'Choose the launch plan'),
      node(meetingId, `${meetingId}-topic-1`, 'TOPIC', 'Options', {
        topicPrompt: 'Which options are viable?',
        transitionHint: 'Compare criteria next.',
      }),
      node(meetingId, `${meetingId}-topic-2`, 'TOPIC', 'Criteria', {
        topicPrompt: 'What matters most?',
        transitionHint: 'Inspect risks next.',
      }),
      node(meetingId, `${meetingId}-topic-3`, 'TOPIC', 'Risks', {
        topicPrompt: 'What could fail?',
        transitionHint: 'Close the decision.',
      }),
      node(meetingId, `${meetingId}-detail`, 'OPTION', 'Launch in one region'),
    ],
  };
}

function graphWithoutNodes(meetingId: string, removedNodeIds: readonly string[]): MeetingGraph {
  const value = graph(meetingId);
  const removed = new Set(removedNodeIds);
  const nodes = value.nodes.filter((item) => !removed.has(item.id));
  const nodesById = new Map(nodes.map((item) => [item.id, item]));
  const edges = value.edges.filter(
    (item) => !removed.has(item.sourceNodeId) && !removed.has(item.targetNodeId),
  );
  const rootId = `${meetingId}-root`;
  const topicOrderByEdgeId = new Map(
    edges
      .filter(
        (item) =>
          item.sourceNodeId === rootId && nodesById.get(item.targetNodeId)?.kind === 'TOPIC',
      )
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map((item, index) => [item.id, index]),
  );

  return {
    edges: edges.map((item) =>
      topicOrderByEdgeId.has(item.id) ? { ...item, order: topicOrderByEdgeId.get(item.id) } : item,
    ),
    meetingId,
    nodes,
  };
}

async function createPreparedMeeting(
  repository: MeetingRepository,
  meetingId: string,
): Promise<Meeting> {
  const confirmed = await createConfirmedBriefMeeting(repository, meetingId);
  const saved = await repository.saveInitialGraph(
    graph(meetingId),
    confirmed.updatedAt,
    new Date('2026-08-29T09:45:00.000Z'),
  );
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw new Error(saved.error.code);
  const aggregate = await readStoredAggregate(repository, meetingId);
  if (aggregate === undefined) throw new Error('Expected prepared meeting');
  return aggregate.meeting;
}

async function createGrillingMeeting(
  repository: MeetingRepository,
  meetingId: string,
): Promise<Meeting> {
  const draft = meeting(meetingId);
  const created = await repository.createMeeting(draft);
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.error.code);

  const grilling = confirmMeetingMode(
    created.value,
    'DECISION',
    'A choice is required',
    new Date('2026-08-29T09:35:00.000Z'),
  );
  expect(grilling.ok).toBe(true);
  if (!grilling.ok) throw new Error(grilling.error.code);
  const saved = await repository.savePreparationTransition(grilling.value, created.value.updatedAt);
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw new Error(saved.error.code);
  return saved.value;
}

async function createConfirmedBriefMeeting(
  repository: MeetingRepository,
  meetingId: string,
  turn?: GrillTurn,
): Promise<Meeting> {
  let grilling = await createGrillingMeeting(repository, meetingId);
  if (turn !== undefined) {
    const savedTurn = await repository.putGrillTurn(
      turn,
      grilling.updatedAt,
      new Date('2026-08-29T09:36:00.000Z'),
    );
    expect(savedTurn).toMatchObject({ ok: true });
    if (!savedTurn.ok) throw new Error(savedTurn.error.code);
    grilling = savedTurn.value.meeting;
  }

  const briefReady = completeGrill(grilling, briefDraft, new Date('2026-08-29T09:38:00.000Z'));
  expect(briefReady.ok).toBe(true);
  if (!briefReady.ok) throw new Error(briefReady.error.code);
  const savedBrief = await repository.savePreparationTransition(
    briefReady.value,
    grilling.updatedAt,
  );
  expect(savedBrief.ok).toBe(true);
  if (!savedBrief.ok) throw new Error(savedBrief.error.code);

  const confirmed = await repository.confirmBrief(
    meetingId,
    savedBrief.value.updatedAt,
    new Date('2026-08-29T09:40:00.000Z'),
  );
  expect(confirmed.ok).toBe(true);
  if (!confirmed.ok) throw new Error(confirmed.error.code);
  return confirmed.value;
}

async function createPreparedMeetingWithGrillTurn(
  repository: MeetingRepository,
  meetingId: string,
  turn: GrillTurn,
): Promise<void> {
  const confirmed = await createConfirmedBriefMeeting(repository, meetingId, turn);
  expect(
    await repository.saveInitialGraph(
      graph(meetingId),
      confirmed.updatedAt,
      new Date('2026-08-29T09:45:00.000Z'),
    ),
  ).toMatchObject({ ok: true });
}

async function storedMeeting(repository: MeetingRepository, meetingId: string): Promise<Meeting> {
  const aggregate = await readStoredAggregate(repository, meetingId);
  if (aggregate === undefined) throw new Error(`Expected ${meetingId}`);
  return aggregate.meeting;
}

async function readStoredAggregate(repository: MeetingRepository, meetingId: string) {
  const result = await repository.getMeetingAggregate(meetingId);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

async function readStoredMeetings(repository: MeetingRepository): Promise<Meeting[]> {
  const result = await repository.listMeetings();
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

async function startStoredMeeting(
  repository: MeetingRepository,
  meetingId: string,
  attendeeCount: number,
  now: Date,
) {
  const current = await storedMeeting(repository, meetingId);
  return repository.startMeeting(meetingId, attendeeCount, current.updatedAt, now);
}

async function endStoredMeeting(
  repository: MeetingRepository,
  meetingId: string,
  now: Date,
  attendeeCount?: number,
) {
  const current = await storedMeeting(repository, meetingId);
  return repository.endMeeting(meetingId, current.updatedAt, now, attendeeCount);
}

async function correctStoredMeetingEnd(
  repository: MeetingRepository,
  meetingId: string,
  correctedEnd: Date,
  now: Date,
) {
  const current = await storedMeeting(repository, meetingId);
  return repository.correctMeetingEndTime(meetingId, correctedEnd, current.updatedAt, now);
}

async function putStoredGrillTurn(repository: MeetingRepository, turn: GrillTurn, now: Date) {
  const current = await storedMeeting(repository, turn.meetingId);
  return repository.putGrillTurn(turn, current.updatedAt, now);
}

beforeEach(() => {
  databaseName = `convergene-test-${crypto.randomUUID()}`;
  databases = [];
});

afterEach(async () => {
  for (const database of databases) database.close();
  await Dexie.delete(databaseName);
});

describe('MeetingRepository', () => {
  it('recovers a complete aggregate after the database is closed and reopened', async () => {
    const firstDatabase = openDatabase();
    const firstRepository = new MeetingRepository(firstDatabase);

    const turn: GrillTurn = {
      answer: 'The sponsor',
      createdAt: timestamp,
      disposition: 'ANSWERED',
      id: 'turn-1',
      index: 0,
      meetingId: 'meeting-1',
      question: 'Who decides?',
    };
    await createPreparedMeetingWithGrillTurn(firstRepository, 'meeting-1', turn);
    const started = await startStoredMeeting(
      firstRepository,
      'meeting-1',
      4,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await expect(
      firstRepository.setActiveTopic(
        'meeting-1',
        'meeting-1-detail',
        started.value.updatedAt,
        new Date('2026-08-29T10:05:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_TOPIC' }, ok: false });
    const focused = await firstRepository.setActiveTopic(
      'meeting-1',
      'meeting-1-topic-2',
      started.value.updatedAt,
      new Date('2026-08-29T10:05:00.000Z'),
    );
    expect(focused.ok).toBe(true);
    if (!focused.ok) return;
    await expect(
      firstRepository.setActiveTopic(
        'meeting-1',
        'meeting-1-topic-3',
        started.value.updatedAt,
        new Date('2026-08-29T10:06:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'STALE_WRITE' }, ok: false });
    expect(
      await firstRepository.markOutcome(
        'meeting-1',
        { id: 'outcome-1', kind: 'DECISION', nodeId: 'meeting-1-detail' },
        focused.value.updatedAt,
        new Date('2026-08-29T10:20:00.000Z'),
      ),
    ).toMatchObject({ ok: true });
    const ended = await endStoredMeeting(
      firstRepository,
      'meeting-1',
      new Date('2026-08-29T10:45:00.000Z'),
    );
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    await firstDatabase.meetings.update('meeting-1', {
      activeTopicNodeId: 'meeting-1-detail',
    });
    await expect(
      firstRepository.saveMeetingReport(
        'meeting-1',
        {
          generatedAt: '2026-08-29T11:00:00.000Z',
          locale: 'en-US',
          markdown: '# Invalid report',
          sourceUpdatedAt: ended.value.updatedAt,
        },
        ended.value.updatedAt,
        new Date('2026-08-29T11:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'DANGLING_REFERENCE' }, ok: false });
    await firstDatabase.meetings.update('meeting-1', {
      activeTopicNodeId: 'meeting-1-topic-2',
    });
    const savedReport = await firstRepository.saveMeetingReport(
      'meeting-1',
      {
        generatedAt: '2026-08-29T11:00:00.000Z',
        locale: 'en-US',
        markdown: '# Persisted report',
        sourceUpdatedAt: ended.value.updatedAt,
      },
      ended.value.updatedAt,
      new Date('2026-08-29T11:00:00.000Z'),
    );
    expect(savedReport.ok).toBe(true);
    if (!savedReport.ok) return;
    expect(savedReport.value.report?.generatedAt).toBe(savedReport.value.updatedAt);
    expect(savedReport.value.report?.sourceUpdatedAt).toBe(savedReport.value.updatedAt);

    firstDatabase.close();
    const reopenedRepository = new MeetingRepository(openDatabase());
    const aggregate = await readStoredAggregate(reopenedRepository, 'meeting-1');

    expect(aggregate).toMatchObject({
      edges: { length: 4 },
      grillTurns: [turn],
      meeting: {
        activeTopicNodeId: 'meeting-1-topic-2',
        endedAt: '2026-08-29T10:45:00.000Z',
        report: { locale: 'en-US', markdown: '# Persisted report' },
        status: 'ENDED',
      },
      nodes: { length: 5 },
      outcomes: [{ id: 'outcome-1', origin: 'LIVE' }],
    });
  });

  it('serializes concurrent cross-instance starts so only one meeting can be LIVE', async () => {
    const firstRepository = new MeetingRepository(openDatabase());
    const secondRepository = new MeetingRepository(openDatabase());
    await createPreparedMeeting(firstRepository, 'meeting-1');
    await createPreparedMeeting(firstRepository, 'meeting-2');

    const results = await Promise.all([
      startStoredMeeting(firstRepository, 'meeting-1', 4, new Date('2026-08-29T10:00:00.000Z')),
      startStoredMeeting(secondRepository, 'meeting-2', 3, new Date('2026-08-29T10:00:00.000Z')),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ error: { code: 'ACTIVE_MEETING_EXISTS' }, ok: false }),
    ]);
    expect(
      (await readStoredMeetings(firstRepository)).filter((item) => item.status === 'LIVE'),
    ).toHaveLength(1);
    expect(await firstRepository.getActiveMeetingId()).toBe(
      results.find((result) => result.ok)?.value.id,
    );
  });

  it('leaves the prior meeting and graph untouched when initial graph validation fails', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    const confirmed = await createConfirmedBriefMeeting(repository, 'meeting-1');
    const invalidGraph = graph('meeting-1');
    invalidGraph.edges[1] = {
      ...invalidGraph.edges[1]!,
      targetNodeId: 'missing-node',
    };

    expect(
      await repository.saveInitialGraph(
        invalidGraph,
        confirmed.updatedAt,
        new Date('2026-08-29T09:45:00.000Z'),
      ),
    ).toMatchObject({ error: { code: 'INVALID_EDGE' }, ok: false });
    expect(await database.nodes.count()).toBe(0);
    expect(await database.edges.count()).toBe(0);
    expect(await database.meetings.get('meeting-1')).toMatchObject({
      preparationStage: 'BRIEF_READY',
    });

    const invalidOrderGraph = graph('meeting-1');
    invalidOrderGraph.edges[3] = { ...invalidOrderGraph.edges[3]!, order: -1 };
    await expect(
      repository.saveInitialGraph(
        invalidOrderGraph,
        confirmed.updatedAt,
        new Date('2026-08-29T09:45:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EDGE' }, ok: false });
    expect(await database.nodes.count()).toBe(0);
    expect(await database.edges.count()).toBe(0);
  });

  it('advances revisions for same-millisecond setup writes and rejects stale tokens', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    const draft = meeting('meeting-1', {
      brief: undefined,
      mode: undefined,
      preparationStage: 'DRAFT',
    });
    await repository.createMeeting(draft);

    const first = await repository.updateMeetingSetup(
      'meeting-1',
      { title: 'First edit' },
      draft.updatedAt,
      new Date(timestamp),
    );
    expect(first).toMatchObject({
      ok: true,
      value: { title: 'First edit', updatedAt: '2026-08-29T09:30:00.001Z' },
    });
    if (!first.ok) return;

    await expect(
      repository.updateMeetingSetup(
        'meeting-1',
        { title: 'Stale edit' },
        draft.updatedAt,
        new Date(timestamp),
      ),
    ).resolves.toMatchObject({ error: { code: 'STALE_WRITE' }, ok: false });
    await expect(
      repository.updateMeetingSetup(
        'meeting-1',
        { title: 'Second edit' },
        first.value.updatedAt,
        new Date(timestamp),
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { title: 'Second edit', updatedAt: '2026-08-29T09:30:00.002Z' },
    });

    await database.meetings.update('meeting-1', {
      updatedAt: '2026-08-29T17:30:00+08:00',
    });
    await expect(
      repository.updateMeetingSetup(
        'meeting-1',
        { title: 'Invalid revision edit' },
        '2026-08-29T17:30:00+08:00',
        new Date(timestamp),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_TIME_RANGE' }, ok: false });
  });

  it('rejects noncanonical persisted timestamps at meeting, graph, and Grill boundaries', async () => {
    const repository = new MeetingRepository(openDatabase());
    await expect(
      repository.createMeeting(
        meeting('local-time', { scheduledStartAt: '2026-08-29T18:00:00+08:00' }),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });

    await createGrillingMeeting(repository, 'meeting-1');
    await expect(
      putStoredGrillTurn(
        repository,
        {
          createdAt: '2026-08-29T17:30:00+08:00',
          disposition: 'UNKNOWN',
          id: 'turn-1',
          index: 0,
          meetingId: 'meeting-1',
          question: 'Who decides?',
        },
        new Date('2026-08-29T09:36:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_GRILL_TURN' }, ok: false });

    const invalidGraph = graph('meeting-1');
    invalidGraph.nodes[0]!.updatedAt = '2026-08-29T17:30:00+08:00';
    await expect(
      repository.saveInitialGraph(
        invalidGraph,
        '2026-08-29T09:35:00.000Z',
        new Date('2026-08-29T09:45:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_TIMESTAMP' }, ok: false });
  });

  it('rejects malformed meeting records and strictly projects every aggregate input', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await expect(
      repository.createMeeting(
        meeting('unsupported-locale', { contentLocale: 'fr-FR' } as unknown as Partial<Meeting>),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
    await expect(
      repository.createMeeting(
        meeting('malformed-brief', {
          brief: { ...briefDraft, assumptions: null },
          mode: 'DECISION',
          preparationStage: 'BRIEF_READY',
        } as unknown as Partial<Meeting>),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
    await expect(
      repository.createMeeting(
        meeting('premature-report', {
          report: {
            generatedAt: timestamp,
            locale: 'en-US',
            markdown: '# Premature report',
            sourceUpdatedAt: timestamp,
          },
        }),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });

    const contaminatedMeeting = {
      ...meeting('meeting-1'),
      apiKey: 'must-not-persist',
      tempUi: { expanded: true },
    } as unknown as Meeting;
    await expect(repository.createMeeting(contaminatedMeeting)).resolves.toMatchObject({
      ok: true,
    });
    expect(await database.meetings.get('meeting-1')).not.toMatchObject({
      apiKey: 'must-not-persist',
      tempUi: { expanded: true },
    });

    const confirmed = await createConfirmedBriefMeeting(repository, 'meeting-2');
    const contaminatedGraph = graph('meeting-2');
    contaminatedGraph.nodes[4] = {
      ...contaminatedGraph.nodes[4]!,
      apiKey: 'node-secret',
      position: { ...contaminatedGraph.nodes[4]!.position, tempUi: { selected: true } },
    } as unknown as MindMapNode;
    await expect(
      repository.saveInitialGraph(
        contaminatedGraph,
        confirmed.updatedAt,
        new Date('2026-08-29T09:45:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(await database.nodes.get('meeting-2-detail')).not.toMatchObject({
      apiKey: 'node-secret',
      position: { tempUi: { selected: true } },
    });

    const grilling = await createGrillingMeeting(repository, 'meeting-3');
    const contaminatedTurn = {
      apiKey: 'grill-secret',
      createdAt: '2026-08-29T09:36:00.000Z',
      disposition: 'UNKNOWN',
      id: 'turn-1',
      index: 0,
      meetingId: 'meeting-3',
      question: 'Who decides?',
      tempUi: { active: true },
    } as unknown as GrillTurn;
    await expect(
      repository.putGrillTurn(
        contaminatedTurn,
        grilling.updatedAt,
        new Date('2026-08-29T09:36:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(await database.grillTurns.get('turn-1')).not.toMatchObject({
      apiKey: 'grill-secret',
      tempUi: { active: true },
    });
  });

  it('exposes only setup-safe meeting edits and keeps script inputs locked after DRAFT', async () => {
    const repository = new MeetingRepository(openDatabase());
    const prepared = await createConfirmedBriefMeeting(repository, 'meeting-1');

    expect('updateMeeting' in repository).toBe(false);
    await expect(
      repository.createMeeting({
        ...meeting('not-initial'),
        brief: briefDraft,
        mode: 'DECISION',
        preparationStage: 'BRIEF_READY',
      }),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });
    await expect(
      repository.createMeeting(
        meeting('invalid-draft', {
          activeTopicNodeId: 'unowned-topic',
          brief: undefined,
          mode: undefined,
          modeReason: 'Reason without a mode',
          preparationStage: 'DRAFT',
        }),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
    await expect(
      repository.updateMeetingSetup(
        'meeting-1',
        { rawRequest: 'Silently replace the generated script input' },
        prepared.updatedAt,
        new Date(timestamp),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });

    const unsafePatch = {
      endedAt: '2030-01-01T00:00:00.000Z',
      status: 'ENDED',
      title: 'Allowed title edit',
    };
    const updated = await repository.updateMeetingSetup(
      'meeting-1',
      unsafePatch,
      prepared.updatedAt,
      new Date(timestamp),
    );
    expect(updated).toMatchObject({
      ok: true,
      value: { status: 'PREPARING', title: 'Allowed title edit' },
    });
    if (updated.ok) expect(updated.value.endedAt).toBeUndefined();
  });

  it('replays preparation transitions against fresh state and rejects tampered snapshots', async () => {
    const repository = new MeetingRepository(openDatabase());
    const grilling = await createGrillingMeeting(repository, 'meeting-1');
    const briefReady = completeGrill(grilling, briefDraft, new Date('2026-08-29T09:35:00.000Z'));
    expect(briefReady.ok).toBe(true);
    if (!briefReady.ok) return;

    await expect(
      repository.savePreparationTransition(
        { ...briefReady.value, mode: 'RETRO', rawRequest: 'Changed after mode lock' },
        grilling.updatedAt,
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });
    await expect(
      repository.savePreparationTransition(
        {
          ...briefReady.value,
          brief: { ...briefDraft, confirmedAt: '2026-08-29T09:35:00.000Z' },
        },
        grilling.updatedAt,
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });
    expect(await readStoredAggregate(repository, 'meeting-1')).toMatchObject({
      meeting: { preparationStage: 'GRILLING' },
    });
  });

  it('rejects graph replacements that would orphan the active topic', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeeting(repository, 'meeting-1');
    const started = await startStoredMeeting(
      repository,
      'meeting-1',
      4,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const replacement = graphWithoutNodes('meeting-1', ['meeting-1-topic-1', 'meeting-1-detail']);
    await expect(
      repository.replaceGraph(
        replacement,
        started.value.updatedAt,
        new Date('2026-08-29T10:05:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'DANGLING_REFERENCE' }, ok: false });
    expect(await database.nodes.count()).toBe(5);
    expect(await database.edges.count()).toBe(4);
  });

  it('rejects graph replacements that would orphan an outcome', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeeting(repository, 'meeting-1');
    const started = await startStoredMeeting(
      repository,
      'meeting-1',
      4,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const marked = await repository.markOutcome(
      'meeting-1',
      { id: 'outcome-1', kind: 'DECISION', nodeId: 'meeting-1-detail' },
      started.value.updatedAt,
      new Date('2026-08-29T10:02:00.000Z'),
    );
    expect(marked.ok).toBe(true);
    const afterMark = await readStoredAggregate(repository, 'meeting-1');
    expect(afterMark).toBeDefined();
    if (afterMark === undefined) return;

    await expect(
      repository.replaceGraph(
        graphWithoutNodes('meeting-1', ['meeting-1-detail']),
        afterMark.meeting.updatedAt,
        new Date('2026-08-29T10:05:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'DANGLING_REFERENCE' }, ok: false });
    expect(await database.outcomes.get('outcome-1')).toBeDefined();
    expect(await database.nodes.get('meeting-1-detail')).toBeDefined();
  });

  it('rejects a stale-tab graph replacement after another graph writer advances the revision', async () => {
    const firstRepository = new MeetingRepository(openDatabase());
    const secondRepository = new MeetingRepository(openDatabase());
    await createPreparedMeeting(firstRepository, 'meeting-1');
    const before = await readStoredAggregate(firstRepository, 'meeting-1');
    expect(before).toBeDefined();
    if (before === undefined) return;

    await expect(
      firstRepository.replaceGraph(
        graph('meeting-1'),
        before.meeting.updatedAt,
        new Date('2026-08-29T09:50:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      secondRepository.replaceGraph(
        graph('meeting-1'),
        before.meeting.updatedAt,
        new Date('2026-08-29T09:51:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'STALE_WRITE' }, ok: false });
  });

  it('snapshots caller-owned graph input before the first asynchronous boundary', async () => {
    const repository = new MeetingRepository(openDatabase());
    const draftInput = meeting('meeting-input');
    const created = repository.createMeeting(draftInput);
    draftInput.title = 'Mutated after invocation';
    await expect(created).resolves.toMatchObject({
      ok: true,
      value: { title: 'Launch decision meeting-input' },
    });

    const prepared = await createPreparedMeeting(repository, 'meeting-1');
    const replacement = graph('meeting-1');
    const saved = repository.replaceGraph(
      replacement,
      prepared.updatedAt,
      new Date('2026-08-29T09:50:00.000Z'),
    );
    replacement.nodes[0]!.title = 'Mutated after invocation';
    replacement.nodes.length = 1;

    await expect(saved).resolves.toMatchObject({ ok: true, value: { nodes: { length: 5 } } });
    expect(await readStoredAggregate(repository, 'meeting-1')).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: 'meeting-1-root', title: 'Choose the launch plan' }),
      ]),
    });

    const afterReplacement = await readStoredAggregate(repository, 'meeting-1');
    if (afterReplacement === undefined) return;
    const children = [
      {
        edgeId: 'meeting-1-expanded-edge-1',
        node: node('meeting-1', 'meeting-1-expanded-1', 'OPTION', 'Original first child', {
          source: 'EXPANSION_AI',
          strategyId: 'DECISION_ADD_OPTION',
        }),
      },
      {
        edgeId: 'meeting-1-expanded-edge-2',
        node: node('meeting-1', 'meeting-1-expanded-2', 'OPTION', 'Original second child', {
          source: 'EXPANSION_AI',
          strategyId: 'DECISION_ADD_OPTION',
        }),
      },
    ];
    const expanded = repository.applyExpansion(
      'meeting-1',
      'meeting-1-topic-1',
      children,
      afterReplacement.meeting.updatedAt,
      new Date('2026-08-29T09:55:00.000Z'),
    );
    children[0]!.node.title = 'Mutated child';
    children.length = 0;
    await expect(expanded).resolves.toMatchObject({ ok: true, value: { nodes: { length: 7 } } });
    expect(await readStoredAggregate(repository, 'meeting-1')).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: 'meeting-1-expanded-1', title: 'Original first child' }),
      ]),
    });
  });

  it('forbids structural graph changes after ENDED but permits narrow node text correction', async () => {
    const repository = new MeetingRepository(openDatabase());
    await createPreparedMeeting(repository, 'meeting-1');
    await startStoredMeeting(repository, 'meeting-1', 4, new Date('2026-08-29T10:00:00.000Z'));
    const ended = await endStoredMeeting(
      repository,
      'meeting-1',
      new Date('2026-08-29T10:45:00.000Z'),
    );
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;

    await expect(
      repository.replaceGraph(
        graph('meeting-1'),
        ended.value.updatedAt,
        new Date('2026-08-29T10:50:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });
    await expect(
      repository.applyExpansion(
        'meeting-1',
        'meeting-1-topic-1',
        [],
        ended.value.updatedAt,
        new Date('2026-08-29T10:50:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });
    await expect(
      repository.reparentNode(
        'meeting-1',
        'meeting-1-detail',
        'meeting-1-topic-2',
        ended.value.updatedAt,
        new Date('2026-08-29T10:50:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });

    await expect(
      repository.updateNodeText(
        'meeting-1',
        'meeting-1-detail',
        { note: 'Corrected after the meeting', title: 'Corrected option' },
        ended.value.updatedAt,
        new Date('2026-08-29T10:50:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true, value: { title: 'Corrected option' } });
    const corrected = await readStoredAggregate(repository, 'meeting-1');
    if (corrected === undefined) return;
    await expect(
      repository.markOutcome(
        'meeting-1',
        { id: 'post-action', kind: 'ACTION', nodeId: 'meeting-1-detail' },
        corrected.meeting.updatedAt,
        new Date('2026-08-29T10:51:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true, value: { origin: 'POST_MEETING' } });
    const withOutcome = await readStoredAggregate(repository, 'meeting-1');
    if (withOutcome === undefined) return;
    const metadataPatch = { apiKey: 'must-not-persist', dueDate: '2026-09-05', owner: 'Casey' };
    await expect(
      repository.updateOutcomeMetadata(
        'meeting-1',
        'post-action',
        metadataPatch,
        withOutcome.meeting.updatedAt,
        new Date('2026-08-29T10:52:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true, value: { dueDate: '2026-09-05', owner: 'Casey' } });
    const withMetadata = await readStoredAggregate(repository, 'meeting-1');
    if (withMetadata === undefined) return;
    await expect(
      repository.updateOutcomeMetadata(
        'meeting-1',
        'post-action',
        { note: 'Keep this note' },
        withMetadata.meeting.updatedAt,
        new Date('2026-08-29T10:53:00.000Z'),
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { dueDate: '2026-09-05', note: 'Keep this note', owner: 'Casey' },
    });
    const withNote = await readStoredAggregate(repository, 'meeting-1');
    if (withNote === undefined) return;
    await expect(
      repository.updateOutcomeMetadata(
        'meeting-1',
        'post-action',
        { owner: undefined },
        withNote.meeting.updatedAt,
        new Date('2026-08-29T10:54:00.000Z'),
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { dueDate: '2026-09-05', note: 'Keep this note', owner: undefined },
    });
    const withoutOwner = await readStoredAggregate(repository, 'meeting-1');
    if (withoutOwner === undefined) return;
    await expect(
      repository.updateOutcomeMetadata(
        'meeting-1',
        'post-action',
        { dueDate: undefined },
        withoutOwner.meeting.updatedAt,
        new Date('2026-08-29T10:55:00.000Z'),
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { dueDate: undefined, note: 'Keep this note', owner: undefined },
    });
    const withoutDueDate = await readStoredAggregate(repository, 'meeting-1');
    if (withoutDueDate === undefined) return;
    await expect(
      repository.updateOutcomeMetadata(
        'meeting-1',
        'post-action',
        { note: undefined },
        withoutDueDate.meeting.updatedAt,
        new Date('2026-08-29T10:56:00.000Z'),
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { dueDate: undefined, note: undefined, owner: undefined },
    });
    const clearedAction = await readStoredAggregate(repository, 'meeting-1');
    if (clearedAction === undefined) return;
    await expect(
      repository.markOutcome(
        'meeting-1',
        { id: 'post-decision', kind: 'DECISION', nodeId: 'meeting-1-topic-1' },
        clearedAction.meeting.updatedAt,
        new Date('2026-08-29T10:57:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true, value: { origin: 'POST_MEETING' } });
    const withDecision = await readStoredAggregate(repository, 'meeting-1');
    if (withDecision === undefined) return;
    await expect(
      repository.updateOutcomeMetadata(
        'meeting-1',
        'post-decision',
        { dueDate: undefined, note: 'Decision context', owner: undefined },
        withDecision.meeting.updatedAt,
        new Date('2026-08-29T10:58:00.000Z'),
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { dueDate: undefined, note: 'Decision context', owner: undefined },
    });
    const withDecisionNote = await readStoredAggregate(repository, 'meeting-1');
    if (withDecisionNote === undefined) return;
    await expect(
      repository.updateOutcomeMetadata(
        'meeting-1',
        'post-decision',
        { owner: 'Not allowed' },
        withDecisionNote.meeting.updatedAt,
        new Date('2026-08-29T10:59:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_OUTCOME' }, ok: false });
    await expect(
      repository.updateOutcomeMetadata(
        'meeting-1',
        'post-decision',
        { note: undefined },
        withDecisionNote.meeting.updatedAt,
        new Date('2026-08-29T11:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true, value: { note: undefined } });
    expect(await readStoredAggregate(repository, 'meeting-1')).not.toMatchObject({
      outcomes: [expect.objectContaining({ apiKey: 'must-not-persist' })],
    });
  });

  it('clears aggregate content according to the two distinct preparation rollback rules', async () => {
    const repository = new MeetingRepository(openDatabase());
    const turn: GrillTurn = {
      createdAt: timestamp,
      disposition: 'ANSWERED',
      id: 'turn-1',
      index: 0,
      meetingId: 'meeting-1',
      question: 'Who decides?',
    };
    await createPreparedMeetingWithGrillTurn(repository, 'meeting-1', turn);
    const prepared = await readStoredAggregate(repository, 'meeting-1');
    expect(prepared).toBeDefined();
    if (prepared === undefined) return;

    const resumed = resumeGrill(prepared.meeting, new Date('2026-08-29T09:50:00.000Z'));
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(
      await repository.savePreparationTransition(resumed.value, prepared.meeting.updatedAt),
    ).toMatchObject({ ok: true });
    expect(await readStoredAggregate(repository, 'meeting-1')).toMatchObject({
      edges: [],
      grillTurns: [{ id: 'turn-1' }],
      meeting: { mode: 'DECISION', preparationStage: 'GRILLING' },
      nodes: [],
    });

    const restarted = restartPreparation(resumed.value, new Date('2026-08-29T09:55:00.000Z'));
    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    expect(
      await repository.savePreparationTransition(restarted.value, resumed.value.updatedAt),
    ).toMatchObject({ ok: true });
    expect(await readStoredAggregate(repository, 'meeting-1')).toMatchObject({
      grillTurns: [],
      meeting: { mode: undefined, preparationStage: 'DRAFT' },
    });
  });

  it('enforces one outcome per node and cascades aggregate deletion', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeeting(repository, 'meeting-1');
    const started = await startStoredMeeting(
      repository,
      'meeting-1',
      4,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(
      await repository.markOutcome(
        'meeting-1',
        { id: 'outcome-1', kind: 'DECISION', nodeId: 'meeting-1-detail' },
        started.value.updatedAt,
        new Date('2026-08-29T10:20:00.000Z'),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await repository.markOutcome(
        'meeting-1',
        { id: 'outcome-2', kind: 'INSIGHT', nodeId: 'meeting-1-detail' },
        started.value.updatedAt,
        new Date('2026-08-29T10:21:00.000Z'),
      ),
    ).toMatchObject({ error: { code: 'OUTCOME_ALREADY_EXISTS' }, ok: false });

    expect(await repository.deleteMeeting('meeting-1')).toMatchObject({ ok: true });
    expect(await readStoredAggregate(repository, 'meeting-1')).toBeUndefined();
    expect(await database.nodes.count()).toBe(0);
    expect(await database.edges.count()).toBe(0);
    expect(await database.outcomes.count()).toBe(0);
    expect(await repository.getActiveMeetingId()).toBeUndefined();
  });

  it('maps concurrent duplicate-outcome attempts to a stable Result code', async () => {
    const firstRepository = new MeetingRepository(openDatabase());
    const secondRepository = new MeetingRepository(openDatabase());
    await createPreparedMeeting(firstRepository, 'meeting-1');
    const started = await startStoredMeeting(
      firstRepository,
      'meeting-1',
      4,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const results = await Promise.all([
      firstRepository.markOutcome(
        'meeting-1',
        { id: 'outcome-1', kind: 'DECISION', nodeId: 'meeting-1-detail' },
        started.value.updatedAt,
        new Date('2026-08-29T10:20:00.000Z'),
      ),
      secondRepository.markOutcome(
        'meeting-1',
        { id: 'outcome-2', kind: 'INSIGHT', nodeId: 'meeting-1-detail' },
        started.value.updatedAt,
        new Date('2026-08-29T10:20:00.000Z'),
      ),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ error: { code: 'OUTCOME_ALREADY_EXISTS' }, ok: false }),
    ]);
  });

  it('atomically advances the aggregate revision when marking and unmarking an outcome', async () => {
    const repository = new MeetingRepository(openDatabase());
    await createPreparedMeeting(repository, 'meeting-1');
    const started = await startStoredMeeting(
      repository,
      'meeting-1',
      4,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const ended = await endStoredMeeting(
      repository,
      'meeting-1',
      new Date('2026-08-29T10:45:00.000Z'),
    );
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    const savedReport = await repository.saveMeetingReport(
      'meeting-1',
      {
        generatedAt: '2026-08-29T10:50:00.000Z',
        locale: 'en-US',
        markdown: '# Existing report',
        sourceUpdatedAt: ended.value.updatedAt,
      },
      ended.value.updatedAt,
      new Date('2026-08-29T10:50:00.000Z'),
    );
    expect(savedReport.ok).toBe(true);
    if (!savedReport.ok) return;
    expect(savedReport.value.report?.sourceUpdatedAt).toBe(savedReport.value.updatedAt);

    await expect(
      repository.markOutcome(
        'meeting-1',
        { id: 'outcome-1', kind: 'DECISION', nodeId: 'meeting-1-detail' },
        savedReport.value.updatedAt,
        new Date('2026-08-29T10:51:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true });
    const marked = await readStoredAggregate(repository, 'meeting-1');
    expect(marked).toBeDefined();
    if (marked === undefined) return;
    expect(Date.parse(marked.meeting.updatedAt)).toBeGreaterThan(
      Date.parse(savedReport.value.updatedAt),
    );
    expect(marked.meeting.report?.sourceUpdatedAt).toBe(savedReport.value.updatedAt);
    expect(marked.meeting.report?.sourceUpdatedAt).not.toBe(marked.meeting.updatedAt);

    await expect(
      repository.unmarkOutcome(
        'meeting-1',
        'outcome-1',
        marked.meeting.updatedAt,
        new Date('2026-08-29T10:52:00.000Z'),
      ),
    ).resolves.toMatchObject({ ok: true });
    const unmarked = await readStoredAggregate(repository, 'meeting-1');
    expect(unmarked?.outcomes).toEqual([]);
    expect(Date.parse(unmarked?.meeting.updatedAt ?? '')).toBeGreaterThan(
      Date.parse(marked.meeting.updatedAt),
    );
  });

  it('rejects initial or corrected end times before the latest LIVE outcome', async () => {
    const repository = new MeetingRepository(openDatabase());
    await createPreparedMeeting(repository, 'meeting-1');
    const started = await startStoredMeeting(
      repository,
      'meeting-1',
      4,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await repository.markOutcome(
      'meeting-1',
      { id: 'outcome-1', kind: 'DECISION', nodeId: 'meeting-1-detail' },
      started.value.updatedAt,
      new Date('2026-08-29T10:30:00.000Z'),
    );

    await expect(
      endStoredMeeting(repository, 'meeting-1', new Date('2026-08-29T10:20:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_TIME_RANGE' }, ok: false });
    await expect(
      endStoredMeeting(repository, 'meeting-1', new Date('2026-08-29T10:45:00.000Z')),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      correctStoredMeetingEnd(
        repository,
        'meeting-1',
        new Date('2026-08-29T10:25:00.000Z'),
        new Date('2026-08-29T11:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_TIME_RANGE' }, ok: false });
  });

  it('rejects a future corrected end time without changing the stored lifecycle', async () => {
    const repository = new MeetingRepository(openDatabase());
    await createPreparedMeeting(repository, 'meeting-1');
    await startStoredMeeting(repository, 'meeting-1', 4, new Date('2026-08-29T10:00:00.000Z'));
    await endStoredMeeting(repository, 'meeting-1', new Date('2026-08-29T10:45:00.000Z'));

    await expect(
      correctStoredMeetingEnd(
        repository,
        'meeting-1',
        new Date('2026-08-29T11:01:00.000Z'),
        new Date('2026-08-29T11:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_TIME_RANGE' }, ok: false });
    expect(await readStoredAggregate(repository, 'meeting-1')).toMatchObject({
      meeting: { endedAt: '2026-08-29T10:45:00.000Z', status: 'ENDED' },
    });
  });

  it('keeps lifecycle revisions monotonic for same-millisecond events and rollback corrections', async () => {
    const repository = new MeetingRepository(openDatabase());
    const prepared = await createPreparedMeeting(repository, 'meeting-1');
    const started = await repository.startMeeting(
      'meeting-1',
      4,
      prepared.updatedAt,
      new Date(prepared.updatedAt),
    );
    expect(started).toMatchObject({
      ok: true,
      value: {
        startedAt: '2026-08-29T09:45:00.000Z',
        updatedAt: '2026-08-29T09:45:00.001Z',
      },
    });
    if (!started.ok) return;
    const ended = await repository.endMeeting(
      'meeting-1',
      started.value.updatedAt,
      new Date(prepared.updatedAt),
    );
    expect(ended).toMatchObject({
      ok: true,
      value: {
        endedAt: '2026-08-29T09:45:00.000Z',
        updatedAt: '2026-08-29T09:45:00.002Z',
      },
    });

    const preparedForCorrection = await createPreparedMeeting(repository, 'meeting-2');
    const laterStart = await repository.startMeeting(
      'meeting-2',
      4,
      preparedForCorrection.updatedAt,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(laterStart.ok).toBe(true);
    if (!laterStart.ok) return;
    const laterEnd = await repository.endMeeting(
      'meeting-2',
      laterStart.value.updatedAt,
      new Date('2026-08-29T10:30:00.000Z'),
    );
    expect(laterEnd.ok).toBe(true);
    if (!laterEnd.ok) return;
    const corrected = await repository.correctMeetingEndTime(
      'meeting-2',
      new Date('2026-08-29T10:20:00.000Z'),
      laterEnd.value.updatedAt,
      new Date('2026-08-29T10:30:00.000Z'),
    );
    expect(corrected).toMatchObject({
      ok: true,
      value: {
        endedAt: '2026-08-29T10:20:00.000Z',
        updatedAt: '2026-08-29T10:30:00.001Z',
      },
    });
    await expect(
      repository.correctMeetingEndTime(
        'meeting-2',
        new Date('2026-08-29T10:25:00.000Z'),
        laterEnd.value.updatedAt,
        new Date('2026-08-29T10:31:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'STALE_WRITE' }, ok: false });
  });

  it('bounds Grill turns to the active preparation phase and stable unique keys', async () => {
    const firstRepository = new MeetingRepository(openDatabase());
    const secondRepository = new MeetingRepository(openDatabase());
    const firstGrilling = await createGrillingMeeting(firstRepository, 'meeting-1');
    await createGrillingMeeting(firstRepository, 'meeting-2');
    await firstRepository.createMeeting(meeting('meeting-3'));

    const turn: GrillTurn = {
      createdAt: timestamp,
      disposition: 'UNKNOWN',
      id: 'turn-1',
      index: 0,
      meetingId: 'meeting-1',
      question: 'Who decides?',
    };
    await expect(
      putStoredGrillTurn(firstRepository, turn, new Date('2026-08-29T09:36:00.000Z')),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      firstRepository.putGrillTurn(
        { ...turn, id: 'stale-turn', index: 3 },
        firstGrilling.updatedAt,
        new Date('2026-08-29T09:37:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'STALE_WRITE' }, ok: false });
    const staleBrief = completeGrill(
      firstGrilling,
      briefDraft,
      new Date('2026-08-29T09:38:00.000Z'),
    );
    expect(staleBrief.ok).toBe(true);
    if (!staleBrief.ok) return;
    await expect(
      firstRepository.savePreparationTransition(staleBrief.value, firstGrilling.updatedAt),
    ).resolves.toMatchObject({ error: { code: 'STALE_WRITE' }, ok: false });
    await expect(
      putStoredGrillTurn(
        firstRepository,
        { ...turn, index: 10, id: 'turn-out-of-range' },
        new Date('2026-08-29T09:37:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_GRILL_TURN' }, ok: false });
    await expect(
      putStoredGrillTurn(
        firstRepository,
        { ...turn, id: 'turn-wrong-stage', meetingId: 'meeting-3' },
        new Date('2026-08-29T09:37:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'INVALID_MEETING_STATE' }, ok: false });
    await expect(
      putStoredGrillTurn(
        firstRepository,
        { ...turn, index: 1, meetingId: 'meeting-2' },
        new Date('2026-08-29T09:37:00.000Z'),
      ),
    ).resolves.toMatchObject({ error: { code: 'GRILL_TURN_ALREADY_EXISTS' }, ok: false });

    const concurrent = await Promise.all([
      putStoredGrillTurn(
        firstRepository,
        { ...turn, id: 'turn-a', index: 2 },
        new Date('2026-08-29T09:38:00.000Z'),
      ),
      putStoredGrillTurn(
        secondRepository,
        { ...turn, id: 'turn-b', index: 2 },
        new Date('2026-08-29T09:38:00.000Z'),
      ),
    ]);
    expect(concurrent.filter((result) => result.ok)).toHaveLength(1);
    expect(concurrent.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({
        error: { code: 'GRILL_TURN_ALREADY_EXISTS' },
        ok: false,
      }),
    ]);
  });

  it('exposes a live-query seam that observes writes made through another database instance', async () => {
    const observedDatabase = openDatabase();
    const writerRepository = new MeetingRepository(openDatabase());
    const observed = new Promise<Meeting[]>((resolve, reject) => {
      const stop = observeMeetings(
        observedDatabase,
        (meetings) => {
          if (meetings.length > 0) {
            stop();
            resolve(meetings);
          }
        },
        reject,
      );
    });

    expect(await writerRepository.createMeeting(meeting('meeting-1'))).toMatchObject({ ok: true });
    await expect(observed).resolves.toMatchObject([{ id: 'meeting-1' }]);
  });

  it('refreshes an observed aggregate when another instance writes only an outcome row', async () => {
    const observedDatabase = openDatabase();
    const writerRepository = new MeetingRepository(openDatabase());
    await createPreparedMeeting(writerRepository, 'meeting-1');
    const started = await startStoredMeeting(
      writerRepository,
      'meeting-1',
      4,
      new Date('2026-08-29T10:00:00.000Z'),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const observed = new Promise<string>((resolve, reject) => {
      const stop = observeMeetingAggregate(
        observedDatabase,
        'meeting-1',
        (aggregate) => {
          const outcomeId = aggregate?.outcomes[0]?.id;
          if (outcomeId !== undefined) {
            stop();
            resolve(outcomeId);
          }
        },
        reject,
      );
    });
    await writerRepository.markOutcome(
      'meeting-1',
      { id: 'outcome-1', kind: 'DECISION', nodeId: 'meeting-1-detail' },
      started.value.updatedAt,
      new Date('2026-08-29T10:20:00.000Z'),
    );

    await expect(observed).resolves.toBe('outcome-1');
  });

  it('strictly projects repository and live-query reads', async () => {
    const observedDatabase = openDatabase();
    const writerDatabase = openDatabase();
    const repository = new MeetingRepository(writerDatabase);
    await createPreparedMeetingWithGrillTurn(repository, 'meeting-1', {
      createdAt: timestamp,
      disposition: 'UNKNOWN',
      id: 'turn-1',
      index: 0,
      meetingId: 'meeting-1',
      question: 'Who decides?',
    });
    const storedMeeting = await writerDatabase.meetings.get('meeting-1');
    const storedNode = await writerDatabase.nodes.get('meeting-1-detail');
    const storedTurn = await writerDatabase.grillTurns.get('turn-1');
    if (storedMeeting === undefined || storedNode === undefined || storedTurn === undefined) return;
    await writerDatabase.meetings.put({
      ...storedMeeting,
      apiKey: 'meeting-secret',
    } as unknown as Meeting);
    await writerDatabase.nodes.put({
      ...storedNode,
      apiKey: 'node-secret',
      position: { ...storedNode.position, tempUi: { selected: true } },
    } as unknown as MindMapNode);
    await writerDatabase.grillTurns.put({
      ...storedTurn,
      apiKey: 'grill-secret',
    } as unknown as GrillTurn);

    const listed = await repository.listMeetings();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(JSON.stringify(listed.value)).not.toContain('meeting-secret');
    const aggregate = await repository.getMeetingAggregate('meeting-1');
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    expect(JSON.stringify(aggregate.value)).not.toContain('apiKey');
    expect(JSON.stringify(aggregate.value)).not.toContain('tempUi');

    const observedMeetings = new Promise<Meeting[]>((resolve, reject) => {
      const stop = observeMeetings(
        observedDatabase,
        (meetings) => {
          stop();
          resolve(meetings);
        },
        reject,
      );
    });
    const observedAggregate = new Promise<unknown>((resolve, reject) => {
      const stop = observeMeetingAggregate(
        observedDatabase,
        'meeting-1',
        (value) => {
          stop();
          resolve(value);
        },
        reject,
      );
    });
    expect(JSON.stringify(await observedMeetings)).not.toContain('meeting-secret');
    expect(JSON.stringify(await observedAggregate)).not.toContain('apiKey');
    expect(JSON.stringify(await observedAggregate)).not.toContain('tempUi');
  });

  it('reports semantic read corruption without terminating aggregate observation', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await repository.createMeeting(meeting('meeting-1'));
    await database.meetings.update('meeting-1', { contentLocale: 'fr-FR' as 'en-US' });

    await expect(repository.listMeetings()).resolves.toMatchObject({
      error: { code: 'INVALID_STORED_DATA' },
      ok: false,
    });
    await expect(repository.getMeetingAggregate('meeting-1')).resolves.toMatchObject({
      error: { code: 'INVALID_STORED_DATA' },
      ok: false,
    });

    const recovered = new Promise<unknown>((resolve, reject) => {
      let sawCorruption = false;
      const stop = observeMeetingAggregate(
        database,
        'meeting-1',
        (aggregate) => {
          if (!sawCorruption) return;
          stop();
          resolve(aggregate);
        },
        (error) => {
          if (!(error instanceof Error) || !('code' in error)) {
            stop();
            reject(error);
            return;
          }
          expect(error).toMatchObject({ code: 'INVALID_STORED_DATA' });
          sawCorruption = true;
          void database.meetings.update('meeting-1', { contentLocale: 'en-US' }).catch(reject);
        },
      );
    });

    await expect(recovered).resolves.toMatchObject({ meeting: { id: 'meeting-1' } });
  });

  it('detects unindexed malformed meetings and recovers with deterministic ordering', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await repository.createMeeting(meeting('meeting-z'));
    await repository.createMeeting(meeting('meeting-a'));
    const missingUpdatedAt = meeting('missing-updated-at') as Partial<Meeting>;
    delete missingUpdatedAt.updatedAt;
    await database.meetings.put(missingUpdatedAt as Meeting);

    await expect(repository.listMeetings()).resolves.toMatchObject({
      error: { code: 'INVALID_STORED_DATA' },
      ok: false,
    });

    const recovered = new Promise<Meeting[]>((resolve, reject) => {
      let sawCorruption = false;
      const stop = observeMeetings(
        database,
        (meetings) => {
          if (!sawCorruption) return;
          stop();
          resolve(meetings);
        },
        (error) => {
          if (!(error instanceof Error) || !('code' in error)) {
            stop();
            reject(error);
            return;
          }
          expect(error).toMatchObject({ code: 'INVALID_STORED_DATA' });
          sawCorruption = true;
          void database.meetings
            .update('missing-updated-at', { updatedAt: '2026-08-29T09:31:00.000Z' })
            .catch(reject);
        },
      );
    });

    await expect(recovered.then((meetings) => meetings.map(({ id }) => id))).resolves.toEqual([
      'missing-updated-at',
      'meeting-a',
      'meeting-z',
    ]);
  });
});

describe('JSON export', () => {
  it('exports a consistent versioned snapshot without app state or credentials', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeetingWithGrillTurn(repository, 'meeting-1', {
      createdAt: timestamp,
      disposition: 'UNKNOWN',
      id: 'turn-1',
      index: 0,
      meetingId: 'meeting-1',
      question: 'Who decides?',
    });
    await startStoredMeeting(repository, 'meeting-1', 4, new Date('2026-08-29T10:00:00.000Z'));
    await endStoredMeeting(repository, 'meeting-1', new Date('2026-08-29T10:45:00.000Z'));
    await database.appState.put({ key: 'guideCompleted', value: true });
    const storedMeeting = await database.meetings.get('meeting-1');
    const storedNode = await database.nodes.get('meeting-1-detail');
    const storedTurn = await database.grillTurns.get('turn-1');
    if (storedMeeting === undefined || storedNode === undefined || storedTurn === undefined) return;
    await database.meetings.put({
      ...storedMeeting,
      apiKey: 'meeting-secret',
      brief: {
        ...storedMeeting.brief!,
        ciphertext: 'brief-secret',
        readiness: { ...storedMeeting.brief!.readiness, tempUi: { expanded: true } },
      },
      report: {
        ciphertext: 'report-secret',
        generatedAt: storedMeeting.updatedAt,
        locale: 'en-US',
        markdown: '# Report',
        sourceUpdatedAt: storedMeeting.updatedAt,
      },
    } as unknown as Meeting);
    await database.nodes.put({
      ...storedNode,
      apiKey: 'node-secret',
      parentSuggestion: {
        alternativeParentNodeIds: ['meeting-1-root', 'meeting-1-topic-2'],
        ciphertext: 'suggestion-secret',
        createdAt: '2026-08-29T10:05:00.000Z',
        rationale: 'Move to a more relevant branch',
        recommendedParentNodeId: 'meeting-1-topic-1',
      },
      position: { ...storedNode.position, tempUi: { selected: true } },
      updatedAt: '2026-08-29T10:05:00.000Z',
    } as unknown as MindMapNode);
    await database.grillTurns.put({
      ...storedTurn,
      ciphertext: 'grill-secret',
    } as unknown as GrillTurn);
    await database.outcomes.add({
      apiKey: 'outcome-secret',
      id: 'outcome-1',
      kind: 'DECISION',
      markedAt: '2026-08-29T10:05:00.000Z',
      meetingId: 'meeting-1',
      nodeId: 'meeting-1-detail',
      origin: 'LIVE',
    } as unknown as Parameters<typeof database.outcomes.add>[0]);

    const result = await createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      exportedAt: '2026-08-29T12:00:00.000Z',
      format: 'convergene-export',
      grillTurns: [{ id: 'turn-1' }],
      meetings: [{ id: 'meeting-1' }],
      version: 1,
    });
    expect(Object.keys(result.value).sort()).toEqual([
      'edges',
      'exportedAt',
      'format',
      'grillTurns',
      'meetings',
      'nodes',
      'outcomes',
      'version',
    ]);
    const serialized = serializeExport(result.value);
    expect(serialized).not.toContain('activeMeetingId');
    expect(serialized).not.toContain('guideCompleted');
    expect(serialized).not.toContain('apiKey');
    expect(serialized).not.toContain('ciphertext');
    expect(serialized).not.toContain('tempUi');
    expect(serialized).not.toContain('meeting-secret');
    expect(exportFilename(new Date('2026-08-29T12:00:00.000Z'))).toBe(
      'convergene-export-2026-08-29.json',
    );
  });

  it('rejects an export snapshot with orphan references', async () => {
    const database = openDatabase();
    await database.nodes.add(node('missing-meeting', 'orphan-node', 'NOTE', 'Orphan'));

    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
  });

  it('rejects a report attached before its meeting has ended', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await repository.createMeeting(meeting('meeting-1'));
    await database.meetings.update('meeting-1', {
      report: {
        generatedAt: timestamp,
        locale: 'en-US',
        markdown: '# Premature report',
        sourceUpdatedAt: timestamp,
      },
    });

    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
  });

  it.each(['DRAFT', 'GRILLING', 'BRIEF_READY'] as const)(
    'rejects graph rows that are incompatible with the %s preparation stage',
    async (stage) => {
      const database = openDatabase();
      const repository = new MeetingRepository(database);
      if (stage === 'DRAFT') {
        await repository.createMeeting(meeting('meeting-1'));
      } else if (stage === 'GRILLING') {
        await createGrillingMeeting(repository, 'meeting-1');
      } else {
        await createConfirmedBriefMeeting(repository, 'meeting-1');
      }
      const invalidGraph = graph('meeting-1');
      await database.nodes.bulkAdd(invalidGraph.nodes);
      await database.edges.bulkAdd(invalidGraph.edges);

      await expect(
        createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
      ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
    },
  );

  it('rejects Grill rows that are incompatible with DRAFT', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await repository.createMeeting(meeting('meeting-1'));
    await database.grillTurns.add({
      createdAt: timestamp,
      disposition: 'UNKNOWN',
      id: 'turn-1',
      index: 0,
      meetingId: 'meeting-1',
      question: 'Who decides?',
    });

    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
  });

  it('rejects cross-meeting edge references even when both node IDs exist', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeeting(repository, 'meeting-1');
    await createPreparedMeeting(repository, 'meeting-2');
    await database.edges.update('meeting-1-edge-detail', {
      targetNodeId: 'meeting-2-detail',
    });

    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
  });

  it('rejects an active topic that is not a first-level TOPIC in its meeting graph', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeeting(repository, 'meeting-1');
    await startStoredMeeting(repository, 'meeting-1', 4, new Date('2026-08-29T10:00:00.000Z'));
    await database.meetings.update('meeting-1', { activeTopicNodeId: 'meeting-1-detail' });

    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
  });

  it('rejects temporally impossible LIVE outcomes and invalid parent suggestions', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeeting(repository, 'meeting-1');
    await startStoredMeeting(repository, 'meeting-1', 4, new Date('2026-08-29T10:00:00.000Z'));
    await endStoredMeeting(repository, 'meeting-1', new Date('2026-08-29T10:45:00.000Z'));
    await database.outcomes.add({
      id: 'late-outcome',
      kind: 'DECISION',
      markedAt: '2026-08-29T10:50:00.000Z',
      meetingId: 'meeting-1',
      nodeId: 'meeting-1-detail',
      origin: 'LIVE',
    });

    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });

    await database.outcomes.delete('late-outcome');
    await database.outcomes.add({
      id: 'local-time-outcome',
      kind: 'DECISION',
      markedAt: '2026-08-29T18:30:00+08:00',
      meetingId: 'meeting-1',
      nodeId: 'meeting-1-detail',
      origin: 'LIVE',
    });
    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
    await database.outcomes.delete('local-time-outcome');
    const detail = await database.nodes.get('meeting-1-detail');
    if (detail === undefined) return;
    await database.nodes.put({
      ...detail,
      parentSuggestion: {
        alternativeParentNodeIds: [],
        createdAt: '2026-08-29T10:05:00.000Z',
        rationale: 'Unknown candidate',
        recommendedParentNodeId: 'missing-node',
      },
    });
    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
  });

  it('returns INVALID_EXPORT instead of throwing for malformed nested persisted data', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeeting(repository, 'meeting-1');
    const stored = await database.meetings.get('meeting-1');
    if (stored?.brief === undefined) return;
    await database.meetings.put({
      ...stored,
      brief: { ...stored.brief, assumptions: null },
    } as unknown as Meeting);

    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
  });

  it('rejects unsupported enum values and invalid non-topic edge orders', async () => {
    const database = openDatabase();
    const repository = new MeetingRepository(database);
    await createPreparedMeeting(repository, 'meeting-1');
    const detail = await database.nodes.get('meeting-1-detail');
    if (detail === undefined) return;
    await database.nodes.put({
      ...detail,
      strategyId: 'UNSUPPORTED_STRATEGY',
    } as unknown as MindMapNode);

    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });

    await database.nodes.put(detail);
    await database.edges.update('meeting-1-edge-detail', { order: -1 });
    await expect(
      createExportSnapshot(database, new Date('2026-08-29T12:00:00.000Z')),
    ).resolves.toMatchObject({ error: { code: 'INVALID_EXPORT' }, ok: false });
  });
});
