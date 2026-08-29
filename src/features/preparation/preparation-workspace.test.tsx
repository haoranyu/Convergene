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
import { grillOutputFixtures, readinessDimensions } from '@/fixtures/preparation';
import { MeetingDatabase, MeetingRepository } from '@/modules/meeting-db';
import { readMeetingAggregate } from '@/modules/meeting-db/read';
import { completeGrill, confirmMeetingMode, type GrillTurn } from '@/modules/meeting-domain';

import type { PreparationAIClient } from './ai-contract';
import { PreparationAIClientError } from './api-client';
import { PreparationWorkspace } from './preparation-workspace';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/meetings/meeting-1/prepare',
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

  it('keeps the exact Brief locked and visible when map generation fails', async () => {
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

    expect(await screen.findByText('Locked snapshot')).toBeVisible();
    expect(screen.getByLabelText('Meeting objective')).toHaveValue('Choose the final launch path');
    expect(screen.getByLabelText('Meeting objective')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry map generation' })).toBeVisible();
    await waitFor(async () => {
      const aggregate = await readMeetingAggregate(database, 'meeting-1');
      expect(aggregate).toMatchObject({
        ok: true,
        value: {
          meeting: {
            brief: {
              confirmedAt: expect.any(String),
              objective: 'Choose the final launch path',
            },
            preparationStage: 'BRIEF_READY',
          },
          nodes: [],
        },
      });
    });
    expect(initialMap).toHaveBeenCalledTimes(1);
  });
});
