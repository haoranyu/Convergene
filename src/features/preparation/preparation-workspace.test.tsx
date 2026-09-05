// @vitest-environment jsdom

import 'fake-indexeddb/auto';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import enUS from '../../../messages/en-US.json';
import { briefDraft, createMeeting } from '@/fixtures/meeting';
import {
  grillOutputFixtures,
  initialMapOutputFixtures,
  readinessDimensions,
} from '@/fixtures/preparation';
import { MeetingDatabase, MeetingRepository } from '@/modules/meeting-db';
import { readMeetingAggregate } from '@/modules/meeting-db/read';
import { completeGrill, confirmMeetingMode, type GrillTurn } from '@/modules/meeting-domain';

import type { PreparationAIClient } from './ai-contract';
import { PreparationAIClientError } from './api-client';
import { PreparationWorkspace } from './preparation-workspace';
import { lockBriefAndGenerateMap, returnToGrill, returnToModeSelection } from './orchestrator';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/meetings/meeting-1/prepare',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
    writable: true,
  });
});

let database: MeetingDatabase;
let databaseName: string;

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  database.close();
  await Dexie.delete(databaseName);
});

async function grillingMeeting(repository: MeetingRepository) {
  const created = await repository.createMeeting(createMeeting());
  if (!created.ok) throw new Error(created.error.code);
  const transition = confirmMeetingMode(
    created.value,
    'DECISION',
    'A choice is required',
    new Date('2026-08-29T09:05:00.000Z'),
  );
  if (!transition.ok) throw new Error(transition.error.code);
  const saved = await repository.savePreparationTransition(
    transition.value,
    created.value.updatedAt,
  );
  if (!saved.ok) throw new Error(saved.error.code);
  return saved.value;
}

function pendingTurn(): GrillTurn {
  return {
    createdAt: '2026-08-29T09:06:00.000Z',
    disposition: 'PENDING',
    id: 'turn-1',
    index: 0,
    knownState: { assumptions: [], confirmed: [], unknowns: ['decision owner'] },
    meetingId: 'meeting-1',
    phase: 'DEFAULT',
    question: 'Who owns the final decision?',
    readiness: { dimensions: readinessDimensions('DECISION'), level: 'INSUFFICIENT' },
    reason: 'Without an owner, this meeting cannot make a decision.',
  };
}

function pendingChoiceTurn(): GrillTurn {
  return {
    ...pendingTurn(),
    options: [
      { label: 'One named decision maker', value: 'named_decision_maker' },
      { label: 'The group decides by consensus', value: 'group_consensus' },
      { label: 'No decision owner yet', value: 'not_decided' },
    ],
    questionType: 'SINGLE_CHOICE',
  };
}

function renderWorkspace(client: PreparationAIClient) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
      <PreparationWorkspace aiClient={client} database={database} meetingId="meeting-1" />
    </NextIntlClientProvider>,
  );
}

describe('PreparationWorkspace', () => {
  it('resumes a draft at meeting mode selection before starting Grill', async () => {
    databaseName = `preparation-ui-${crypto.randomUUID()}`;
    database = new MeetingDatabase(databaseName);
    const repository = new MeetingRepository(database);
    const createdAt = new Date(Date.now() - 1_000).toISOString();
    const created = await repository.createMeeting(
      createMeeting({ createdAt, updatedAt: createdAt }),
    );
    if (!created.ok) throw new Error(created.error.code);

    const client: PreparationAIClient = {
      grill: vi.fn().mockResolvedValue(grillOutputFixtures.DECISION),
      initialMap: vi.fn(),
    };
    const user = userEvent.setup();
    renderWorkspace(client);

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Choose the meeting script first',
      }),
    ).toBeVisible();
    expect(
      screen.getByText('Surface alternatives, criteria, risks, and the person who owns the call.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'A low-key fallback when the request does not fit the three focused scripts.',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Align on a decision' }));
    await user.click(screen.getByRole('button', { name: 'Confirm and start Grill' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Who owns the final decision?' }),
    ).toBeVisible();
    await waitFor(async () => {
      const aggregate = await readMeetingAggregate(database, 'meeting-1');
      expect(aggregate).toMatchObject({
        ok: true,
        value: {
          meeting: { mode: 'DECISION', preparationStage: 'GRILLING' },
        },
      });
    });
  });

  it('clears the prior mode selection when preparation restarts', async () => {
    databaseName = `preparation-ui-${crypto.randomUUID()}`;
    database = new MeetingDatabase(databaseName);
    const repository = new MeetingRepository(database);
    const createdAt = new Date(Date.now() - 1_000).toISOString();
    const created = await repository.createMeeting(
      createMeeting({ createdAt, updatedAt: createdAt }),
    );
    if (!created.ok) throw new Error(created.error.code);

    const client: PreparationAIClient = {
      grill: vi.fn().mockResolvedValue({
        ...grillOutputFixtures.DECISION,
        question: undefined,
        reason: undefined,
        shouldAsk: false,
        suggestedBrief: briefDraft,
      }),
      initialMap: vi.fn(),
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWorkspace(client);

    await user.click(
      await screen.findByRole('button', {
        name: 'Align on a decision',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm and start Grill' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Meeting Brief' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Prepare again' }));

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Choose the meeting script first',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Align on a decision' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Confirm and start Grill' })).toBeDisabled();
  });

  it('shows one current question and persists its answer before requesting the next', async () => {
    databaseName = `preparation-ui-${crypto.randomUUID()}`;
    database = new MeetingDatabase(databaseName);
    const repository = new MeetingRepository(database);
    const meeting = await grillingMeeting(repository);
    const stored = await repository.putGrillTurn(
      pendingTurn(),
      meeting.updatedAt,
      new Date('2026-08-29T09:06:00.000Z'),
    );
    if (!stored.ok) throw new Error(stored.error.code);

    const client: PreparationAIClient = {
      grill: vi.fn().mockResolvedValue({
        ...grillOutputFixtures.DECISION,
        question: 'Which options are genuinely viable?',
      }),
      initialMap: vi.fn(),
    };
    const user = userEvent.setup();
    renderWorkspace(client);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Who owns the final decision?' }),
    ).toBeVisible();
    await user.type(screen.getByLabelText('Your answer'), 'The product sponsor');
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Which options are genuinely viable?' }),
    ).toBeVisible();
    const aggregate = await readMeetingAggregate(database, 'meeting-1');
    expect(aggregate).toMatchObject({
      ok: true,
      value: {
        grillTurns: [
          { answer: 'The product sponsor', disposition: 'ANSWERED', index: 0 },
          { disposition: 'PENDING', index: 1 },
        ],
      },
    });
  });

  it('uses a single-choice control by default and persists the selected label', async () => {
    databaseName = `preparation-ui-${crypto.randomUUID()}`;
    database = new MeetingDatabase(databaseName);
    const repository = new MeetingRepository(database);
    const meeting = await grillingMeeting(repository);
    const stored = await repository.putGrillTurn(
      pendingChoiceTurn(),
      meeting.updatedAt,
      new Date('2026-08-29T09:06:00.000Z'),
    );
    if (!stored.ok) throw new Error(stored.error.code);

    const nextFreeTextQuestion = {
      ...grillOutputFixtures.DECISION,
      options: undefined,
      question: 'Which decision criteria matter most?',
      questionType: 'FREE_TEXT' as const,
    };
    const client: PreparationAIClient = {
      grill: vi.fn().mockResolvedValue(nextFreeTextQuestion),
      initialMap: vi.fn(),
    };
    const user = userEvent.setup();
    renderWorkspace(client);

    expect(await screen.findByText('Choose one answer')).toBeVisible();
    const submit = screen.getByRole('button', { name: 'Submit answer' });
    expect(submit).toBeDisabled();
    const selectedOption = screen.getByRole('radio', { name: 'One named decision maker' });
    await user.click(selectedOption);
    expect(selectedOption).toBeChecked();
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'None of these — write another answer' }),
    ).toBeVisible();
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: nextFreeTextQuestion.question,
      }),
    ).toBeVisible();
    const aggregate = await readMeetingAggregate(database, 'meeting-1');
    expect(aggregate).toMatchObject({
      ok: true,
      value: {
        grillTurns: [
          {
            answer: 'One named decision maker',
            disposition: 'ANSWERED',
            questionType: 'SINGLE_CHOICE',
          },
          { disposition: 'PENDING', questionType: 'FREE_TEXT' },
        ],
      },
    });
  });

  it('keeps the edited Brief unlocked when map generation fails before the atomic save', async () => {
    databaseName = `preparation-ui-${crypto.randomUUID()}`;
    database = new MeetingDatabase(databaseName);
    const repository = new MeetingRepository(database);
    const grilling = await grillingMeeting(repository);
    const completed = completeGrill(grilling, briefDraft, new Date('2026-08-29T09:07:00.000Z'));
    if (!completed.ok) throw new Error(completed.error.code);
    const briefReady = await repository.savePreparationTransition(
      completed.value,
      grilling.updatedAt,
    );
    if (!briefReady.ok) throw new Error(briefReady.error.code);

    const initialMap = vi
      .fn<PreparationAIClient['initialMap']>()
      .mockRejectedValue(new PreparationAIClientError('PROVIDER_UNAVAILABLE'));
    const client: PreparationAIClient = { grill: vi.fn(), initialMap };
    const user = userEvent.setup();
    renderWorkspace(client);

    await user.clear(await screen.findByLabelText('Meeting objective'));
    await user.type(screen.getByLabelText('Meeting objective'), 'Choose the final launch path');
    await user.click(screen.getByRole('button', { name: 'Confirm, lock, and generate map' }));

    expect(await screen.findByText('Editable draft')).toBeVisible();
    expect(screen.getByLabelText('Meeting objective')).toHaveValue('Choose the final launch path');
    await waitFor(async () => {
      const aggregate = await readMeetingAggregate(database, 'meeting-1');
      expect(aggregate).toMatchObject({
        ok: true,
        value: {
          meeting: {
            brief: {
              objective: 'Choose the final launch path',
            },
            preparationStage: 'BRIEF_READY',
          },
          nodes: [],
        },
      });
      if (aggregate.ok && aggregate.value !== undefined) {
        expect(aggregate.value.meeting.brief?.confirmedAt).toBeUndefined();
      }
    });
    expect(screen.getByLabelText('Meeting objective')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Confirm, lock, and generate map' })).toBeVisible();
    expect(initialMap).toHaveBeenCalledTimes(1);
  });

  it.each([enUS.preparation.actions.saveDraft, enUS.preparation.actions.confirmGenerate])(
    'preserves an unsaved Brief across another tab update and rejects stale %s',
    async (action) => {
      databaseName = `preparation-ui-${crypto.randomUUID()}`;
      database = new MeetingDatabase(databaseName);
      const repository = new MeetingRepository(database);
      const grilling = await grillingMeeting(repository);
      const completed = completeGrill(grilling, briefDraft, new Date('2026-08-29T09:07:00.000Z'));
      if (!completed.ok) throw new Error(completed.error.code);
      const ready = await repository.savePreparationTransition(completed.value, grilling.updatedAt);
      if (!ready.ok) throw new Error(ready.error.code);

      const client: PreparationAIClient = { grill: vi.fn(), initialMap: vi.fn() };
      const user = userEvent.setup();
      renderWorkspace(client);
      const objective = await screen.findByLabelText('Meeting objective');
      await user.clear(objective);
      await user.type(objective, 'My unsaved objective');

      const updated = await repository.updateBriefDraft(
        ready.value.id,
        { ...briefDraft, objective: 'Objective saved in another tab' },
        ready.value.updatedAt,
        new Date('2026-08-29T09:08:00.000Z'),
      );
      if (!updated.ok) throw new Error(updated.error.code);
      const renamed = await repository.updateMeetingSetup(
        ready.value.id,
        { title: 'Meeting updated in another tab' },
        updated.value.updatedAt,
        new Date('2026-08-29T09:09:00.000Z'),
      );
      if (!renamed.ok) throw new Error(renamed.error.code);
      await screen.findByRole('heading', { level: 1, name: renamed.value.title });

      expect(objective).toHaveValue('My unsaved objective');
      await user.click(screen.getByRole('button', { name: action }));
      expect(await screen.findByText(enUS.preparation.errors.STALE_WRITE)).toBeVisible();
      expect(objective).toHaveValue('My unsaved objective');
      expect(client.initialMap).not.toHaveBeenCalled();
      expect((await database.meetings.get(ready.value.id))?.brief?.objective).toBe(
        'Objective saved in another tab',
      );

      const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
      await user.click(
        screen.getByRole('button', { name: enUS.preparation.actions.loadSavedDraft }),
      );
      expect(confirm).toHaveBeenCalledWith(enUS.preparation.brief.loadSavedConfirm);
      expect(objective).toHaveValue('My unsaved objective');
      await user.click(
        screen.getByRole('button', { name: enUS.preparation.actions.loadSavedDraft }),
      );
      expect(objective).toHaveValue('Objective saved in another tab');
      expect(screen.queryByText(enUS.preparation.errors.STALE_WRITE)).not.toBeInTheDocument();

      for (const value of ['Reviewed objective', 'Further reviewed objective']) {
        await user.clear(objective);
        await user.type(objective, value);
        await user.click(screen.getByRole('button', { name: enUS.preparation.actions.saveDraft }));
        await waitFor(async () => {
          expect((await database.meetings.get(ready.value.id))?.brief?.objective).toBe(value);
        });
        expect(objective).toHaveValue(value);
      }
      expect(client.initialMap).not.toHaveBeenCalled();
    },
  );

  it('updates an untouched Brief when another tab saves a newer version', async () => {
    databaseName = `preparation-ui-${crypto.randomUUID()}`;
    database = new MeetingDatabase(databaseName);
    const repository = new MeetingRepository(database);
    const grilling = await grillingMeeting(repository);
    const completed = completeGrill(grilling, briefDraft, new Date('2026-08-29T09:07:00.000Z'));
    if (!completed.ok) throw new Error(completed.error.code);
    const ready = await repository.savePreparationTransition(completed.value, grilling.updatedAt);
    if (!ready.ok) throw new Error(ready.error.code);
    renderWorkspace({ grill: vi.fn(), initialMap: vi.fn() });
    const objective = await screen.findByLabelText('Meeting objective');

    const updated = await repository.updateBriefDraft(
      ready.value.id,
      { ...briefDraft, objective: 'New saved objective' },
      ready.value.updatedAt,
      new Date('2026-08-29T09:08:00.000Z'),
    );
    if (!updated.ok) throw new Error(updated.error.code);

    await waitFor(() => expect(objective).toHaveValue('New saved objective'));
  });

  it.each(['DRAFT', 'GRILLING', 'MAP_READY'] as const)(
    'retains a copyable unsaved Brief when another tab moves to %s',
    async (stage) => {
      databaseName = `preparation-ui-${crypto.randomUUID()}`;
      database = new MeetingDatabase(databaseName);
      const repository = new MeetingRepository(database);
      const grilling = await grillingMeeting(repository);
      const completed = completeGrill(grilling, briefDraft, new Date('2026-08-29T09:07:00.000Z'));
      if (!completed.ok) throw new Error(completed.error.code);
      const ready = await repository.savePreparationTransition(completed.value, grilling.updatedAt);
      if (!ready.ok) throw new Error(ready.error.code);
      const client: PreparationAIClient = { grill: vi.fn(), initialMap: vi.fn() };
      const user = userEvent.setup();
      renderWorkspace(client);
      const objective = await screen.findByLabelText('Meeting objective');
      await user.clear(objective);
      await user.type(objective, 'Keep my unsaved work');

      const now = new Date('2026-08-29T09:08:00.000Z');
      if (stage === 'DRAFT') await returnToModeSelection(ready.value, repository, now);
      else if (stage === 'GRILLING') await returnToGrill(ready.value, repository, now);
      else {
        const aggregate = await repository.getMeetingAggregate(ready.value.id);
        if (!aggregate.ok || !aggregate.value) throw new Error('Expected meeting');
        await lockBriefAndGenerateMap(aggregate.value, {
          client: {
            grill: vi.fn(),
            initialMap: vi.fn().mockResolvedValue(initialMapOutputFixtures.DECISION),
          },
          now: () => now,
          repository,
        });
      }

      await screen.findByText('Your unsaved Brief is preserved');
      expect(screen.getByLabelText('Meeting objective')).toHaveValue('Keep my unsaved work');
      expect(screen.getByLabelText('Meeting objective')).toHaveAttribute('readonly');
      expect(client.grill).not.toHaveBeenCalled();
      expect(client.initialMap).not.toHaveBeenCalled();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
      await user.click(screen.getByRole('button', { name: 'Continue with the saved meeting' }));
      expect(confirm).toHaveBeenCalled();
      expect(screen.getByLabelText('Meeting objective')).toHaveValue('Keep my unsaved work');
      await user.click(screen.getByRole('button', { name: 'Continue with the saved meeting' }));
      expect(screen.queryByText('Your unsaved Brief is preserved')).not.toBeInTheDocument();
      expect((await database.meetings.get(ready.value.id))?.preparationStage).toBe(stage);
    },
  );
});
