import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMeeting } from '@/fixtures/meeting';
import {
  grillOutputFixtures,
  preparationBriefFixtures,
  primaryPreparationModes,
} from '@/fixtures/preparation';
import { MeetingDatabase, MeetingRepository } from '@/modules/meeting-db';
import { readMeetingAggregate, type MeetingAggregate } from '@/modules/meeting-db/read';
import { confirmMeetingMode } from '@/modules/meeting-domain';

import type { GrillOutput, PreparationAIClient } from './ai-contract';
import { answerCurrentGrillTurn, runGrillStep } from './orchestrator';

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
});
