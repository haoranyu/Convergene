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

type ProviderGateReason =
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_CAPABILITY_UNAVAILABLE'
  | 'PROVIDER_CONFIG_INVALID'
  | 'PROVIDER_NOT_CONFIGURED';

export function providerConfigGateReason(value: unknown): ProviderGateReason | null {
  const code = readErrorCode(value);
  return code === 'PROVIDER_NOT_CONFIGURED' ||
    code === 'PROVIDER_CAPABILITY_UNAVAILABLE' ||
    code === 'PROVIDER_CONFIG_INVALID' ||
    code === 'PROVIDER_AUTH_FAILED'
    ? code
    : null;
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
  const [gateErrorCode, setGateErrorCode] = useState<
    | 'PROVIDER_AUTH_FAILED'
    | 'PROVIDER_CAPABILITY_UNAVAILABLE'
    | 'PROVIDER_CONFIG_INVALID'
    | undefined
  >();
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const openDialog = useCallback(() => {
    setGateErrorCode(undefined);
    setTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setMounted(true);
    setOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
  }, []);

  const handleAIError = useCallback((error: unknown) => {
    const reason = providerConfigGateReason(error);
    if (!reason) {
      return false;
    }

    setGateErrorCode(reason === 'PROVIDER_NOT_CONFIGURED' ? undefined : reason);
    setTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setMounted(true);
    setOpen(true);
    return true;
  }, []);

  return (
    <>
      {children({ handleAIError, open: openDialog })}
      {mounted ? (
        <ProviderConfigDialog
          api={api}
          gateErrorCode={gateErrorCode}
          onAfterClose={() => {
            trigger?.focus();
            setTrigger(null);
            setGateErrorCode(undefined);
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
