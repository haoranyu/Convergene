// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

afterEach(cleanup);

function renderPanel(
  api: ProviderConfigClient,
  reconfigurationErrorCode?: 'PROVIDER_AUTH_FAILED' | 'PROVIDER_CONFIG_INVALID',
) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
      <ProviderConfigPanel api={api} reconfigurationErrorCode={reconfigurationErrorCode} />
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
          activeProvider: 'STEPFUN',
          configured: true,
          providers: {
            SILICONFLOW: null,
            STEPFUN: {
              createdAt: '2026-08-29T00:00:00.000Z',
              keyHint: '••••••••',
              lastUsedAt: '2026-08-29T00:00:00.000Z',
              models: {
                fast: 'step-3.5-flash-2603',
                grill: 'step-3.5-flash-2603',
                report: 'step-3.5-flash-2603',
              },
              provider: 'STEPFUN',
              state: 'AVAILABLE',
            },
          },
        },
      });
    const testConnection = vi.fn<ProviderConfigClient['testConnection']>().mockResolvedValue({
      ok: true,
      value: {
        models: {
          fast: 'step-3.5-flash-2603',
          grill: 'step-3.5-flash-2603',
          report: 'step-3.5-flash-2603',
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
      selectProvider: vi.fn(),
      testConnection,
    };

    renderPanel(api);

    const apiKey = await screen.findByLabelText('API key');
    expect(apiKey).toHaveAttribute('autocomplete', 'off');
    expect(apiKey).toHaveAttribute('data-1p-ignore', 'true');
    expect(apiKey).toHaveAttribute('data-bwignore', 'true');
    expect(apiKey).toHaveAttribute('data-lpignore', 'true');
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
      selectProvider: vi.fn(),
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

  it('keeps the reconfiguration form available when the stored envelope is invalid', async () => {
    const api: ProviderConfigClient = {
      deleteConfig: vi.fn(),
      getStatus: vi.fn<ProviderConfigClient['getStatus']>().mockResolvedValue({
        error: { code: 'PROVIDER_CONFIG_INVALID' },
        ok: false,
      }),
      saveConfig: vi.fn(),
      selectProvider: vi.fn(),
      testConnection: vi.fn(),
    };

    renderPanel(api);

    expect(await screen.findByLabelText('API key')).toBeVisible();
    expect(
      screen.getByText('The saved configuration can no longer be used. Enter the key again.'),
    ).toBeVisible();
  });

  it('forces reconfiguration after an AI call discovers a rotated encryption secret', async () => {
    const api: ProviderConfigClient = {
      deleteConfig: vi.fn(),
      getStatus: vi.fn<ProviderConfigClient['getStatus']>().mockResolvedValue({
        ok: true,
        value: {
          activeProvider: 'STEPFUN',
          configured: true,
          providers: {
            SILICONFLOW: null,
            STEPFUN: {
              createdAt: '2026-08-29T00:00:00.000Z',
              keyHint: '••••••••',
              lastUsedAt: '2026-08-29T00:00:00.000Z',
              models: {
                fast: 'step-3.5-flash-2603',
                grill: 'step-3.5-flash-2603',
                report: 'step-3.5-flash-2603',
              },
              provider: 'STEPFUN',
              state: 'AVAILABLE',
            },
          },
        },
      }),
      saveConfig: vi.fn(),
      selectProvider: vi.fn(),
      testConnection: vi.fn(),
    };

    renderPanel(api, 'PROVIDER_CONFIG_INVALID');

    expect(await screen.findByLabelText('API key')).toBeVisible();
    expect(
      screen.getByText('The saved configuration can no longer be used. Enter the key again.'),
    ).toBeVisible();
  });

  it('shows both saved providers and switches without asking for another key', async () => {
    const user = userEvent.setup();
    const credential = (provider: 'STEPFUN' | 'SILICONFLOW') => ({
      createdAt: '2026-08-29T00:00:00.000Z',
      keyHint: '••••••••' as const,
      lastUsedAt: '2026-08-29T00:00:00.000Z',
      models:
        provider === 'STEPFUN'
          ? {
              fast: 'step-3.5-flash-2603',
              grill: 'step-3.5-flash-2603',
              report: 'step-3.5-flash-2603',
            }
          : {
              fast: 'deepseek-ai/DeepSeek-V4-Flash',
              grill: 'deepseek-ai/DeepSeek-V4-Flash',
              report: 'deepseek-ai/DeepSeek-V4-Flash',
            },
      provider,
      state: 'AVAILABLE' as const,
    });
    const providers = {
      SILICONFLOW: credential('SILICONFLOW'),
      STEPFUN: credential('STEPFUN'),
    };
    const selectProvider = vi.fn<ProviderConfigClient['selectProvider']>().mockResolvedValue({
      ok: true,
      value: { activeProvider: 'SILICONFLOW', configured: true, providers },
    });
    const api: ProviderConfigClient = {
      deleteConfig: vi.fn(),
      getStatus: vi.fn<ProviderConfigClient['getStatus']>().mockResolvedValue({
        ok: true,
        value: { activeProvider: 'STEPFUN', configured: true, providers },
      }),
      saveConfig: vi.fn(),
      selectProvider,
      testConnection: vi.fn(),
    };

    renderPanel(api);

    expect(await screen.findByText('StepFun is selected for AI actions')).toBeVisible();
    expect(screen.getByText('SiliconFlow is saved and ready to select')).toBeVisible();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use SiliconFlow' }));

    await waitFor(() => expect(selectProvider).toHaveBeenCalledWith('SILICONFLOW'));
    expect(await screen.findByText('SiliconFlow is selected for AI actions')).toBeVisible();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  });
});
