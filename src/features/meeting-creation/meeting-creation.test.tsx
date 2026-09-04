// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import enUS from '../../../messages/en-US.json';

import { classifyMeetingClient } from './classify-client';
import { MeetingCreation } from './meeting-creation';

vi.mock('@/features/app-shell', () => ({ AppHeader: () => null }));
vi.mock('@/features/provider-config', () => ({
  ProviderConfigGate: ({
    children,
  }: {
    children: (value: { handleAIError: () => boolean }) => ReactNode;
  }) => children({ handleAIError: () => false }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      addListener: vi.fn(),
      matches: false,
      removeListener: vi.fn(),
    })),
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('meeting creation request ownership', () => {
  it.each([
    ['The original meeting request', 'Review the launch after the incident.'],
    ['Title · optional', 'Updated title'],
    ['Expected attendees', '8'],
  ])('keeps edits to %s and ignores the superseded recommendation', async (label, value) => {
    const user = userEvent.setup();
    let complete:
      ((value: Awaited<ReturnType<typeof classifyMeetingClient.classify>>) => void) | undefined;
    const classify = vi.spyOn(classifyMeetingClient, 'classify').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const result = {
      ok: true as const,
      value: {
        confidence: 'HIGH' as const,
        reason: 'Choose a launch plan.',
        recommendedMode: 'DECISION' as const,
        suggestedTitle: 'Original recommendation',
      },
    };
    classify.mockResolvedValue(result);
    render(
      <NextIntlClientProvider locale="en-US" messages={enUS}>
        <MeetingCreation />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('The original meeting request'), {
      target: { value: 'Choose one launch plan.' },
    });
    await user.click(screen.getByRole('button', { name: 'Recommend a meeting script' }));
    await waitFor(() => expect(classify).toHaveBeenCalledTimes(1));
    const signal = classify.mock.calls[0]?.[2];
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

    // The transport deliberately ignores abort: a late result must still be discarded.
    await act(async () => complete?.(result));
    expect(screen.getByLabelText(label)).toHaveValue(value);
    expect(screen.queryByText('Suggested title: Original recommendation')).not.toBeInTheDocument();
    expect(signal?.aborted).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Recommend a meeting script' }));
    await waitFor(() => expect(classify).toHaveBeenCalledTimes(2));
    expect(classify.mock.calls[1]?.[0]).toMatchObject({
      rawRequest: label === 'The original meeting request' ? value : 'Choose one launch plan.',
      ...(label === 'Title · optional' ? { userTitle: value } : {}),
    });
    await user.click(await screen.findByRole('button', { name: 'Edit meeting details' }));
    expect(screen.getByLabelText(label)).toHaveValue(value);
  });
});
