// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import enUS from '../../../messages/en-US.json';
import { createLiveMeetingFixture } from '@/fixtures/live-meeting';
import { createMapReadyMeeting } from '@/fixtures/meeting';

import { EndMeetingDialog } from './end-meeting-dialog';
import { LiveMeetingToolbar } from './live-meeting-toolbar';
import { OutcomePanel } from './outcome-panel';
import { StartMeetingDialog } from './start-meeting-dialog';
import { formatElapsedClock } from './use-live-clock';

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

afterEach(cleanup);

function renderEnglish(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

describe('live meeting controls', () => {
  it('renders stable elapsed, overtime, attendee, and person-hour facts', async () => {
    const aggregate = createLiveMeetingFixture();
    const onEndRequest = vi.fn();
    renderEnglish(
      <LiveMeetingToolbar
        fixedNow={new Date('2026-08-29T11:15:00.000Z')}
        meeting={aggregate.meeting}
        onEndRequest={onEndRequest}
        outcomes={aggregate.outcomes}
      />,
    );

    expect(screen.getByText('01:15:00')).toBeVisible();
    expect(screen.getByText('In progress · overtime')).toBeVisible();
    expect(screen.getByText('4 attendees')).toBeVisible();
    expect(screen.getByText('5 person-hours')).toBeVisible();
    expect(document.querySelector('img[src="/brand/convergene-mark.svg"]')).toBeNull();
    expect(screen.queryByText('Convergene')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End meeting' }));
    expect(onEndRequest).toHaveBeenCalledOnce();
  });

  it('confirms the attendee snapshot before starting and exposes an active-meeting conflict', async () => {
    const user = userEvent.setup();
    const meeting = createMapReadyMeeting();
    const startedMeeting = {
      ...meeting,
      actualAttendeeCount: 6,
      startedAt: '2026-08-29T10:00:00.000Z',
      status: 'LIVE' as const,
    };
    const onStart = vi.fn().mockResolvedValue({ ok: true, value: startedMeeting });
    const onStarted = vi.fn();
    const view = renderEnglish(
      <StartMeetingDialog
        meeting={meeting}
        onCancel={vi.fn()}
        onOpenActiveMeeting={vi.fn()}
        onRequestEndActiveMeeting={vi.fn()}
        onStart={onStart}
        onStarted={onStarted}
        open
      />,
    );

    const attendeeInput = screen.getByRole('spinbutton', { name: 'Actual attendees' });
    fireEvent.change(attendeeInput, { target: { value: '6' } });
    await user.click(screen.getByRole('button', { name: 'Start meeting' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(6));
    expect(onStarted).toHaveBeenCalledWith(startedMeeting);

    view.unmount();
    const onOpenActiveMeeting = vi.fn();
    const onRequestEndActiveMeeting = vi.fn();
    renderEnglish(
      <StartMeetingDialog
        activeMeetingId="meeting-live"
        meeting={meeting}
        onCancel={vi.fn()}
        onOpenActiveMeeting={onOpenActiveMeeting}
        onRequestEndActiveMeeting={onRequestEndActiveMeeting}
        onStart={onStart}
        open
      />,
    );
    expect(screen.getByText('Another meeting is already LIVE')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review and end live meeting' }));
    expect(onRequestEndActiveMeeting).toHaveBeenCalledWith('meeting-live');
    await user.click(screen.getByRole('button', { name: 'Return to live meeting' }));
    expect(onOpenActiveMeeting).toHaveBeenCalledWith('meeting-live');
  });

  it('marks only after an explicit user action and leaves optional action fields empty', async () => {
    const user = userEvent.setup();
    const aggregate = createLiveMeetingFixture({
      meeting: { mode: 'BRAINSTORM' },
      outcomes: [],
    });
    const onMark = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        id: 'outcome-new',
        kind: 'CANDIDATE_IDEA',
        markedAt: '2026-08-29T10:30:00.000Z',
        meetingId: aggregate.meeting.id,
        nodeId: 'topic-options',
        origin: 'LIVE',
      },
    });
    renderEnglish(
      <OutcomePanel
        createOutcomeId={() => 'outcome-new'}
        meeting={aggregate.meeting}
        node={{ id: 'topic-options', title: 'Compare options' }}
        onMark={onMark}
        onUnmark={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(onMark).not.toHaveBeenCalled();
    const kindSelect = screen.getByRole('combobox', { name: 'Outcome type' });
    expect(kindSelect).toHaveTextContent('Candidate idea');
    await user.click(kindSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Action item' }));
    expect(screen.getByRole('textbox', { name: 'Owner (optional)' })).toHaveValue('');
    expect(screen.getByLabelText('Due date (optional)')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Add to meeting outcomes' }));
    await waitFor(() =>
      expect(onMark).toHaveBeenCalledWith({
        dueDate: undefined,
        id: 'outcome-new',
        kind: 'ACTION',
        nodeId: 'topic-options',
        owner: undefined,
      }),
    );
  });

  it('edits optional action metadata and confirms cancellation before recalculation', async () => {
    const user = userEvent.setup();
    const aggregate = createLiveMeetingFixture();
    const action = aggregate.outcomes.find((outcome) => outcome.kind === 'ACTION');
    expect(action).toBeDefined();
    if (action === undefined) return;
    const onUpdate = vi.fn().mockResolvedValue({
      ok: true,
      value: { ...action, dueDate: '2026-09-05', owner: 'Casey' },
    });
    const onUnmark = vi.fn().mockResolvedValue({ ok: true, value: action });
    renderEnglish(
      <OutcomePanel
        existingOutcome={action}
        meeting={aggregate.meeting}
        node={{ id: action.nodeId, title: 'Agree on criteria' }}
        onMark={vi.fn()}
        onUnmark={onUnmark}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByText(/Owner \(optional\): Not set/)).toBeVisible();
    expect(screen.getByText(/Due date \(optional\): Not set/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit action details' }));
    await user.type(screen.getByRole('textbox', { name: 'Owner (optional)' }), 'Casey');
    fireEvent.change(screen.getByLabelText('Due date (optional)'), {
      target: { value: '2026-09-05' },
    });
    await user.click(screen.getByRole('button', { name: 'Save action details' }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(action.id, {
        dueDate: '2026-09-05',
        owner: 'Casey',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Remove from outcomes' }));
    expect(onUnmark).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove outcome' }));
    await waitFor(() => expect(onUnmark).toHaveBeenCalledWith(action.id));
  });

  it('requires a second confirmation while still allowing a zero-outcome meeting to end', async () => {
    const user = userEvent.setup();
    const aggregate = createLiveMeetingFixture({ outcomes: [] });
    const endedMeeting = {
      ...aggregate.meeting,
      endedAt: '2026-08-29T10:30:00.000Z',
      status: 'ENDED' as const,
    };
    const onEnd = vi.fn().mockResolvedValue({ ok: true, value: endedMeeting });
    const onEnded = vi.fn();
    renderEnglish(
      <EndMeetingDialog
        fixedNow={new Date('2026-08-29T10:30:00.000Z')}
        meeting={aggregate.meeting}
        nodes={aggregate.nodes}
        onCancel={vi.fn()}
        onEnd={onEnd}
        onEnded={onEnded}
        open
        outcomes={aggregate.outcomes}
      />,
    );

    expect(screen.getByText('This meeting has not left any formal outcomes yet.')).toBeVisible();
    const parkingSummary = screen.getByText('Parking lot items').parentElement;
    expect(parkingSummary).not.toBeNull();
    expect(within(parkingSummary!).getByText('1')).toBeVisible();
    const attendeeInput = screen.getByRole('spinbutton', { name: 'Actual attendees' });
    fireEvent.change(attendeeInput, { target: { value: '5' } });
    await user.click(screen.getByRole('button', { name: 'Continue to confirmation' }));
    expect(onEnd).not.toHaveBeenCalled();
    expect(
      screen.getByText(/This meeting has no formal outcomes\. You can still end it/),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirm and end meeting' }));
    await waitFor(() => expect(onEnd).toHaveBeenCalledWith(5));
    expect(onEnded).toHaveBeenCalledWith(endedMeeting);
  });

  it('keeps the end controls available at a 375px viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const aggregate = createLiveMeetingFixture();
    renderEnglish(
      <EndMeetingDialog
        fixedNow={new Date('2026-08-29T10:30:00.000Z')}
        meeting={aggregate.meeting}
        nodes={aggregate.nodes}
        onCancel={vi.fn()}
        onEnd={vi.fn()}
        open
        outcomes={aggregate.outcomes}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Return to meeting' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Continue to confirmation' })).toBeVisible();
  });
});

describe('elapsed clock formatting', () => {
  it('uses fixed-width tabular hours, minutes, and seconds', () => {
    expect(
      formatElapsedClock('2026-08-29T10:00:00.000Z', new Date('2026-08-29T12:03:04.000Z')),
    ).toBe('02:03:04');
  });
});
