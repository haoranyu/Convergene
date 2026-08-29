import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMeeting } from '@/fixtures/meeting';
import {
  grillOutputFixtures,
  initialMapOutputFixtures,
  preparationBriefFixtures,
  primaryPreparationModes,
} from '@/fixtures/preparation';
import { MeetingDatabase, MeetingRepository } from '@/modules/meeting-db';
import { readMeetingAggregate, type MeetingAggregate } from '@/modules/meeting-db/read';
import { completeGrill, confirmMeetingMode } from '@/modules/meeting-domain';
import { buildCanvasElements } from '@/features/meeting-room/canvas-view-model';

import type { GrillOutput, PreparationAIClient } from './ai-contract';
import { answerCurrentGrillTurn, lockBriefAndGenerateMap, runGrillStep } from './orchestrator';
import { runReliableGrillCall, runReliableInitialMapCall } from './preparation-reliability';

let database: MeetingDatabase;
let databaseName: string;

afterEach(async () => {
  database.close();
  await Dexie.delete(databaseName);
});

async function aggregate(): Promise<MeetingAggregate> {
  const result = await readMeetingAggregate(database, 'meeting-1');
  if (!result.ok || result.value === undefined) throw new Error('Expected meeting aggregate');
  return result.value;
}

describe('preparation orchestration fixtures', () => {
  it.each(primaryPreparationModes)(
    'walks the complete five-round %s Grill into a Brief',
    async (mode) => {
      databaseName = `preparation-flow-${crypto.randomUUID()}`;
      database = new MeetingDatabase(databaseName);
      const repository = new MeetingRepository(database);
      const created = await repository.createMeeting(createMeeting());
      if (!created.ok) throw new Error(created.error.code);
      const selected = confirmMeetingMode(
        created.value,
        mode,
        'Fixture-selected script',
        new Date('2026-08-29T09:01:00.000Z'),
      );
      if (!selected.ok) throw new Error(selected.error.code);
      const grilling = await repository.savePreparationTransition(
        selected.value,
        created.value.updatedAt,
      );
      if (!grilling.ok) throw new Error(grilling.error.code);

      const snapshot = preparationBriefFixtures[mode];
      const grill = vi.fn<PreparationAIClient['grill']>(async (input): Promise<GrillOutput> => {
        if (input.turnIndex < 5) {
          return {
            ...grillOutputFixtures[mode],
            question: `Fixture question ${input.turnIndex + 1}`,
          };
        }
        return {
          readiness: snapshot.readiness,
          shouldAsk: false,
          suggestedBrief: {
            assumptions: snapshot.assumptions,
            confirmed: snapshot.confirmed,
            desiredOutcome: snapshot.desiredOutcome,
            facilitation: snapshot.facilitation,
            objective: snapshot.objective,
            unknowns: snapshot.unknowns,
          },
          updatedState: {
            assumptions: snapshot.assumptions,
            confirmed: snapshot.confirmed,
            unknowns: snapshot.unknowns,
          },
        };
      });
      const client: PreparationAIClient = { grill, initialMap: vi.fn() };
      let id = 0;
      const dependencies = {
        client,
        createId: () => `turn-${id++}`,
        now: () => new Date(`2026-08-29T09:${String(2 + id).padStart(2, '0')}:00.000Z`),
        repository,
      };

      for (let index = 0; index < 5; index += 1) {
        const question = await runGrillStep(await aggregate(), dependencies);
        expect(question).toMatchObject({ kind: 'QUESTION', turn: { index, phase: 'DEFAULT' } });
        if (question.kind !== 'QUESTION') throw new Error('Expected fixture question');
        await answerCurrentGrillTurn(
          question.meeting,
          question.turn,
          'ANSWERED',
          `Fixture answer ${index + 1}`,
          dependencies,
        );
      }

      const completed = await runGrillStep(await aggregate(), dependencies);
      expect(completed).toMatchObject({
        kind: 'BRIEF',
        meeting: {
          brief: { objective: snapshot.objective },
          mode,
          preparationStage: 'BRIEF_READY',
        },
      });
      expect(grill).toHaveBeenCalledTimes(6);
      expect(grill.mock.calls.map(([input]) => input.phase)).toEqual([
        'DEFAULT',
        'DEFAULT',
        'DEFAULT',
        'DEFAULT',
        'DEFAULT',
        'CRITICAL_EXTRA',
      ]);
    },
  );

  it('does not confirm the Brief or partially write a graph when both map candidates are invalid', async () => {
    databaseName = `preparation-atomic-map-${crypto.randomUUID()}`;
    database = new MeetingDatabase(databaseName);
    const repository = new MeetingRepository(database);
    const created = await repository.createMeeting(createMeeting());
    if (!created.ok) throw new Error(created.error.code);
    const selected = confirmMeetingMode(
      created.value,
      'DECISION',
      'Decision fixture',
      new Date('2026-08-29T09:01:00.000Z'),
    );
    if (!selected.ok) throw new Error(selected.error.code);
    const grilling = await repository.savePreparationTransition(
      selected.value,
      created.value.updatedAt,
    );
    if (!grilling.ok) throw new Error(grilling.error.code);
    const { confirmedAt, ...briefDraft } = preparationBriefFixtures.DECISION;
    expect(confirmedAt).toBe('2026-08-29T09:30:00.000Z');
    const completed = completeGrill(
      grilling.value,
      structuredClone(briefDraft),
      new Date('2026-08-29T09:02:00.000Z'),
    );
    if (!completed.ok) throw new Error(completed.error.code);
    const briefReady = await repository.savePreparationTransition(
      completed.value,
      grilling.value.updatedAt,
    );
    if (!briefReady.ok) throw new Error(briefReady.error.code);

    const invalid = {
      ...initialMapOutputFixtures.DECISION,
      nodes: initialMapOutputFixtures.DECISION.nodes.slice(0, 2),
    };
    const initialMap = vi.fn<PreparationAIClient['initialMap']>().mockResolvedValue(invalid);
    await expect(
      lockBriefAndGenerateMap(await aggregate(), {
        client: { grill: vi.fn(), initialMap },
        now: () => new Date('2026-08-29T09:03:00.000Z'),
        repository,
      }),
    ).rejects.toBeInstanceOf(Error);

    const persisted = await aggregate();
    expect(initialMap).toHaveBeenCalledTimes(1);
    expect(persisted.meeting).toMatchObject({ preparationStage: 'BRIEF_READY' });
    expect(persisted.meeting.brief?.confirmedAt).toBeUndefined();
    expect(persisted.nodes).toEqual([]);
    expect(persisted.edges).toEqual([]);
  });

  it('moves a created meeting through Grill, fallback Brief, fallback Map, and Canvas after two invalid outputs', async () => {
    databaseName = `preparation-fallback-path-${crypto.randomUUID()}`;
    database = new MeetingDatabase(databaseName);
    const repository = new MeetingRepository(database);
    const created = await repository.createMeeting(createMeeting());
    if (!created.ok) throw new Error(created.error.code);
    const selected = confirmMeetingMode(
      created.value,
      'DECISION',
      'A decision is required',
      new Date('2026-08-29T09:01:00.000Z'),
    );
    if (!selected.ok) throw new Error(selected.error.code);
    const grilling = await repository.savePreparationTransition(
      selected.value,
      created.value.updatedAt,
    );
    if (!grilling.ok) throw new Error(grilling.error.code);

    const grillProvider = vi.fn().mockResolvedValue({ invalid: true });
    const mapProvider = vi.fn().mockResolvedValue({ invalid: true });
    let id = 0;
    let minute = 2;
    const dependencies = {
      client: {
        grill: (input, outputLocale) =>
          runReliableGrillCall({ callProvider: grillProvider, input, outputLocale }),
        initialMap: (input, outputLocale) =>
          runReliableInitialMapCall({ callProvider: mapProvider, input, outputLocale }),
      } satisfies PreparationAIClient,
      createId: () => `fallback-id-${id++}`,
      now: () => new Date(`2026-08-29T09:${String(minute++).padStart(2, '0')}:00.000Z`),
      repository,
    };

    const question = await runGrillStep(await aggregate(), dependencies);
    expect(question.kind).toBe('QUESTION');
    if (question.kind !== 'QUESTION') throw new Error('Expected fallback question');
    await answerCurrentGrillTurn(
      question.meeting,
      question.turn,
      'ANSWERED',
      'The product sponsor owns it.',
      dependencies,
    );
    const brief = await runGrillStep(await aggregate(), dependencies, { finishRequested: true });
    expect(brief.kind).toBe('BRIEF');
    await lockBriefAndGenerateMap(await aggregate(), dependencies);

    const persisted = await aggregate();
    expect(persisted.meeting).toMatchObject({
      brief: { confirmedAt: expect.any(String) },
      preparationStage: 'MAP_READY',
    });
    expect(persisted.nodes.filter(({ kind }) => kind === 'TOPIC')).toHaveLength(3);
    const canvas = buildCanvasElements(persisted, {
      activeTopic: 'Current topic',
      nodeKinds: {
        ACTION: 'Action',
        IDEA: 'Idea',
        INSIGHT: 'Insight',
        NOTE: 'Note',
        OBJECTIVE: 'Objective',
        OPTION: 'Option',
        PARKING: 'Parking',
        RISK: 'Risk',
        TOPIC: 'Topic',
      },
      outcome: 'Outcome',
    });
    expect(canvas.nodes).toHaveLength(4);
    expect(grillProvider).toHaveBeenCalledTimes(4);
    expect(mapProvider).toHaveBeenCalledTimes(2);
  });
});
