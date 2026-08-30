// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../../messages/en-US.json';
import { providerCapabilities, providerModelPresets } from '@/modules/provider-config';

import { ModelStatusControl } from './model-status-control';

const getStatus = vi.hoisted(() => vi.fn());

vi.mock('../provider-config/api-client', () => ({
  providerConfigClient: { getStatus },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  getStatus.mockReset();
});

function renderControl() {
  return render(
    <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
      <ModelStatusControl />
    </NextIntlClientProvider>,
  );
}

describe('ModelStatusControl', () => {
  it('shows a capability warning when the active credential cannot run live AI', async () => {
    getStatus.mockResolvedValue({
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
            models: providerModelPresets.STEPFUN,
            provider: 'STEPFUN',
            state: 'AVAILABLE',
          },
        },
      },
    });

    renderControl();

    expect(await screen.findByRole('button', { name: 'Live AI unavailable' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'StepFun' })).not.toBeInTheDocument();
  });

  it('does not ask users to reconfigure an unusable historical StepFun key', async () => {
    getStatus.mockResolvedValue({
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
            models: providerModelPresets.STEPFUN,
            provider: 'STEPFUN',
            state: 'NEEDS_RECONFIGURATION',
          },
        },
      },
    });

    renderControl();

    expect(await screen.findByRole('button', { name: 'Historical key unavailable' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Model needs a new key' })).not.toBeInTheDocument();
  });

  it('shows the configured provider as ready only when live AI is available', async () => {
    getStatus.mockResolvedValue({
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
            models: providerModelPresets.SILICONFLOW,
            provider: 'SILICONFLOW',
            state: 'AVAILABLE',
          },
          STEPFUN: null,
        },
      },
    });

    renderControl();

    expect(await screen.findByRole('link', { name: 'SiliconFlow' })).toHaveAttribute(
      'href',
      '/settings/model',
    );
    expect(screen.queryByRole('button', { name: 'Live AI unavailable' })).not.toBeInTheDocument();
  });
});
