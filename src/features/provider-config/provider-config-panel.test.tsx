// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import enUS from '../../../messages/en-US.json';
import {
  providerCapabilities,
  providerModelPresets,
  type ProviderConfigSummary,
} from '../../modules/provider-config';
import type { ProviderConfigClient } from './api-client';
import { ProviderConfigGate } from './provider-config-gate';
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

const availableSummary: ProviderConfigSummary = {
  activeProvider: 'SILICONFLOW',
  configured: true,
  providers: {
    SILICONFLOW: {
      capabilities: providerCapabilities.SILICONFLOW,
      createdAt: '2026-08-29T00:00:00.000Z',
      keyHint: '••••••••',
      lastUsedAt: '2026-08-29T00:00:00.000Z',
      models: providerModelPresets.SILICONFLOW,
      provider: 'SILICONFLOW',
      state: 'AVAILABLE',
    },
    STEPFUN: null,
  },
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderPanel(
  api: ProviderConfigClient,
  gateErrorCode?:
    'PROVIDER_AUTH_FAILED' | 'PROVIDER_CAPABILITY_UNAVAILABLE' | 'PROVIDER_CONFIG_INVALID',
) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
      <ProviderConfigPanel api={api} gateErrorCode={gateErrorCode} />
    </NextIntlClientProvider>,
  );
}

describe('ProviderConfigPanel', () => {
  it.each(['save', 'status refresh'] as const)(
    'keeps a reopened configuration gate open when an old %s completes',
    async (pendingStep) => {
      const user = userEvent.setup();
      const pending = deferred<Awaited<ReturnType<ProviderConfigClient['saveConfig']>>>();
      const onConfigured = vi.fn();
      const unconfigured = {
        ok: true as const,
        value: { configured: false as const, state: 'NOT_CONFIGURED' as const },
      };
      const getStatus = vi.fn<ProviderConfigClient['getStatus']>().mockResolvedValue(unconfigured);
      if (pendingStep === 'status refresh') {
        getStatus.mockResolvedValueOnce(unconfigured).mockReturnValueOnce(pending.promise);
      }
      const api: ProviderConfigClient = {
        deleteConfig: vi.fn(),
        getStatus,
        saveConfig: vi
          .fn<ProviderConfigClient['saveConfig']>()
          .mockReturnValue(
            pendingStep === 'save'
              ? pending.promise
              : Promise.resolve({ ok: true, value: availableSummary }),
          ),
        selectProvider: vi.fn(),
        testConnection: vi.fn<ProviderConfigClient['testConnection']>().mockResolvedValue({
          ok: true,
          value: { models: providerModelPresets.SILICONFLOW, provider: 'SILICONFLOW' },
        }),
      };

      render(
        <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
          <ProviderConfigGate api={api} onConfigured={onConfigured}>
            {({ open }) => <button onClick={open}>Open model settings</button>}
          </ProviderConfigGate>
        </NextIntlClientProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'Open model settings' }));
      await user.type(await screen.findByLabelText('API key'), 'sk-pending');
      await user.click(screen.getByRole('button', { name: 'Test connection' }));
      await screen.findByText('Connection verified. You can save this configuration.');
      await user.click(screen.getByRole('button', { name: 'Save configuration' }));
      await waitFor(() => expect(api.saveConfig).toHaveBeenCalledOnce());
      if (pendingStep === 'status refresh') {
        await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
      }

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Open model settings' }));
      await screen.findByLabelText('API key');
      await act(async () => pending.resolve({ ok: true, value: availableSummary }));

      expect(onConfigured).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Connect a model provider' })).toBeVisible();
      expect(screen.getByLabelText('API key')).toBeEnabled();
    },
  );

  it('prevents clearing or replacing configuration while a test or save is pending', async () => {
    const user = userEvent.setup();
    const tested = deferred<Awaited<ReturnType<ProviderConfigClient['testConnection']>>>();
    const saved = deferred<Awaited<ReturnType<ProviderConfigClient['saveConfig']>>>();
    const api: ProviderConfigClient = {
      deleteConfig: vi.fn(),
      getStatus: vi.fn<ProviderConfigClient['getStatus']>().mockResolvedValue({
        ok: true,
        value: availableSummary,
      }),
      saveConfig: vi.fn<ProviderConfigClient['saveConfig']>().mockReturnValue(saved.promise),
      selectProvider: vi.fn(),
      testConnection: vi
        .fn<ProviderConfigClient['testConnection']>()
        .mockReturnValue(tested.promise),
    };

    renderPanel(api);

    await user.click(await screen.findByRole('button', { name: 'Replace configuration' }));
    await user.type(screen.getByLabelText('API key'), 'sk-replacement');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(screen.getByRole('button', { name: 'Clear model configuration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace configuration' })).toBeDisabled();
    await act(async () => {
      tested.resolve({
        ok: true,
        value: { models: providerModelPresets.SILICONFLOW, provider: 'SILICONFLOW' },
      });
    });

    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(screen.getByRole('button', { name: 'Clear model configuration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace configuration' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear model configuration' }));
    expect(api.deleteConfig).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Clear configuration' })).not.toBeInTheDocument();

    await act(async () => saved.resolve({ ok: true, value: availableSummary }));
    expect(screen.getByRole('button', { name: 'Clear model configuration' })).toBeEnabled();
  });

  it('tests before saving and never leaves the plaintext key in the form', async () => {
    const user = userEvent.setup();
    const getStatus = vi
      .fn<ProviderConfigClient['getStatus']>()
      .mockResolvedValueOnce({ ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          activeProvider: 'SILICONFLOW',
          configured: true,
          providers: {
            SILICONFLOW: {
              capabilities: providerCapabilities.SILICONFLOW,
              createdAt: '2026-08-29T00:00:00.000Z',
              keyHint: '••••••••',
              lastUsedAt: '2026-08-29T00:00:00.000Z',
              models: {
                fast: 'Qwen/Qwen3.5-4B',
                grill: 'deepseek-ai/DeepSeek-V4-Flash',
                report: 'deepseek-ai/DeepSeek-V4-Flash',
              },
              provider: 'SILICONFLOW',
              state: 'AVAILABLE',
            },
            STEPFUN: null,
          },
        },
      });
    const testConnection = vi.fn<ProviderConfigClient['testConnection']>().mockResolvedValue({
      ok: true,
      value: {
        models: {
          fast: 'Qwen/Qwen3.5-4B',
          grill: 'deepseek-ai/DeepSeek-V4-Flash',
          report: 'deepseek-ai/DeepSeek-V4-Flash',
        },
        provider: 'SILICONFLOW',
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
      provider: 'SILICONFLOW',
    });
    expect(apiKey).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Save configuration' }));

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalledWith({
        apiKey: 'sk-test-secret',
        provider: 'SILICONFLOW',
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

  it('routes an unusable historical StepFun key to SiliconFlow without offering StepFun reconfiguration', async () => {
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
              capabilities: providerCapabilities.STEPFUN,
              createdAt: '2026-08-29T00:00:00.000Z',
              keyHint: '••••••••',
              lastUsedAt: '2026-08-29T00:00:00.000Z',
              models: {
                fast: 'step-3.7-flash',
                grill: 'step-3.5-flash-2603',
                report: 'step-3.5-flash-2603',
              },
              provider: 'STEPFUN',
              state: 'NEEDS_RECONFIGURATION',
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
      screen.getByText(
        'The historical StepFun key cannot be used or reconnected. Connect or switch to SiliconFlow.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'The historical StepFun key can no longer be used. Connect or switch to SiliconFlow, or clear the retained configuration.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Historical key unavailable')).toBeVisible();
    expect(screen.queryByText('Model needs a new key')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use StepFun' })).not.toBeInTheDocument();
  });

  it('keeps the StepFun key while requiring an explicit switch to SiliconFlow', async () => {
    const user = userEvent.setup();
    const credential = (provider: 'STEPFUN' | 'SILICONFLOW') => ({
      capabilities: providerCapabilities[provider],
      createdAt: '2026-08-29T00:00:00.000Z',
      keyHint: '••••••••' as const,
      lastUsedAt: '2026-08-29T00:00:00.000Z',
      models:
        provider === 'STEPFUN'
          ? {
              fast: 'step-3.7-flash',
              grill: 'step-3.5-flash-2603',
              report: 'step-3.5-flash-2603',
            }
          : {
              fast: 'Qwen/Qwen3.5-4B',
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

    expect(
      await screen.findByText(
        'StepFun is still active for preparation. Classification and live node suggestions are disabled; switch to SiliconFlow.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByText('Live AI unavailable')).toBeVisible();
    expect(screen.getAllByText('Not enabled')).toHaveLength(3);
    expect(screen.queryByText('step-3.7-flash')).not.toBeInTheDocument();
    expect(screen.getByText('SiliconFlow is saved and ready to select')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Use StepFun' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use SiliconFlow' }));

    await waitFor(() => expect(selectProvider).toHaveBeenCalledWith('SILICONFLOW'));
    expect(await screen.findByText('SiliconFlow is selected for AI actions')).toBeVisible();
    expect(
      screen.getByText(
        'StepFun key is retained for historical compatibility and cannot be selected for live AI.',
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  });
});
