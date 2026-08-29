// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import enUS from '../../../messages/en-US.json';
import type { ProviderConfigClient } from './api-client';
import { ProviderConfigPanel } from './provider-config-panel';

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

function renderPanel(api: ProviderConfigClient) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
      <ProviderConfigPanel api={api} />
    </NextIntlClientProvider>,
  );
}

describe('ProviderConfigPanel', () => {
  it('tests before saving and never leaves the plaintext key in the form', async () => {
    const user = userEvent.setup();
    const getStatus = vi
      .fn<ProviderConfigClient['getStatus']>()
      .mockResolvedValueOnce({ ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          configured: true,
          lastUsedAt: '2026-08-29T00:00:00.000Z',
          models: {
            fast: 'step-3.7-flash',
            grill: 'step-3.7-flash',
            report: 'step-3.7-flash',
          },
          provider: 'STEPFUN',
          state: 'AVAILABLE',
        },
      });
    const testConnection = vi.fn<ProviderConfigClient['testConnection']>().mockResolvedValue({
      ok: true,
      value: {
        models: {
          fast: 'step-3.7-flash',
          grill: 'step-3.7-flash',
          report: 'step-3.7-flash',
        },
        provider: 'STEPFUN',
      },
    });
    const saveConfig = vi.fn<ProviderConfigClient['saveConfig']>().mockResolvedValue({
      ok: true,
      value: { configured: false, state: 'NOT_CONFIGURED' },
    });
    const api: ProviderConfigClient = {
      deleteConfig: vi.fn(),
      getStatus,
      saveConfig,
      testConnection,
    };

    renderPanel(api);

    const apiKey = await screen.findByLabelText('API key');
    expect(apiKey).toHaveAttribute('autocomplete', 'new-password');
    await user.type(apiKey, 'sk-test-secret');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    await screen.findByText('Connection verified. You can save this configuration.');
    expect(testConnection).toHaveBeenCalledWith({
      apiKey: 'sk-test-secret',
      provider: 'STEPFUN',
    });
    expect(apiKey).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Save configuration' }));

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalledWith({
        apiKey: 'sk-test-secret',
        provider: 'STEPFUN',
      });
    });
    expect(await screen.findByText('••••••••')).toBeVisible();
    expect(screen.queryByDisplayValue('sk-test-secret')).not.toBeInTheDocument();
  });

  it('maps stable provider errors to safe copy and clears a rejected key', async () => {
    const user = userEvent.setup();
    const api: ProviderConfigClient = {
      deleteConfig: vi.fn(),
      getStatus: vi
        .fn<ProviderConfigClient['getStatus']>()
        .mockResolvedValue({ ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } }),
      saveConfig: vi.fn(),
      testConnection: vi.fn<ProviderConfigClient['testConnection']>().mockResolvedValue({
        error: { code: 'PROVIDER_AUTH_FAILED' },
        ok: false,
      }),
    };

    renderPanel(api);

    const apiKey = await screen.findByLabelText('API key');
    await user.type(apiKey, 'rejected-plaintext-key');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    await screen.findByText('Authentication failed. Check the API key and try again.');
    expect(apiKey).toHaveValue('');
    expect(screen.queryByText('rejected-plaintext-key')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
  });
});
