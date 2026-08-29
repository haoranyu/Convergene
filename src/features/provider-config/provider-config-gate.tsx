'use client';

import { type ReactNode, useCallback, useState } from 'react';

import type { ProviderConfigSummary } from '@/modules/provider-config';

import type { ProviderConfigClient } from './api-client';
import { ProviderConfigDialog } from './provider-config-dialog';

function readErrorCode(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  if ('code' in value) {
    return value.code;
  }

  if ('error' in value) {
    return readErrorCode(value.error);
  }

  return undefined;
}

export function isProviderNotConfigured(value: unknown): boolean {
  return readErrorCode(value) === 'PROVIDER_NOT_CONFIGURED';
}

export interface ProviderConfigGateController {
  handleAIError: (error: unknown) => boolean;
  open: () => void;
}

interface ProviderConfigGateProps {
  api?: ProviderConfigClient;
  children: (controller: ProviderConfigGateController) => ReactNode;
  onConfigured?: (summary: ProviderConfigSummary) => void;
}

export function ProviderConfigGate({ api, children, onConfigured }: ProviderConfigGateProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const openDialog = useCallback(() => {
    setTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setMounted(true);
    setOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
  }, []);

  const handleAIError = useCallback(
    (error: unknown) => {
      if (!isProviderNotConfigured(error)) {
        return false;
      }

      openDialog();
      return true;
    },
    [openDialog],
  );

  return (
    <>
      {children({ handleAIError, open: openDialog })}
      {mounted ? (
        <ProviderConfigDialog
          api={api}
          onAfterClose={() => {
            trigger?.focus();
            setTrigger(null);
            setMounted(false);
          }}
          onClose={closeDialog}
          onConfigured={(summary) => {
            onConfigured?.(summary);
            closeDialog();
          }}
          open={open}
        />
      ) : null}
    </>
  );
}
