'use client';

import { Button, Spin } from '@arco-design/web-react';
import {
  IconCheckCircleFill,
  IconExclamationCircleFill,
  IconSafe,
} from '@arco-design/web-react/icon';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Link } from '@/i18n/navigation';
import type { ProviderConfigSummary } from '@/modules/provider-config';

import styles from './app-shell.module.css';
import { providerConfigClient } from '../provider-config/api-client';
import { ProviderConfigGate } from '../provider-config/provider-config-gate';

export function ModelStatusControl() {
  const t = useTranslations('appShell.model');
  const providerT = useTranslations('providerConfig');
  const [status, setStatus] = useState<ProviderConfigSummary | null | undefined>(undefined);

  const loadStatus = useCallback(async () => {
    const result = await providerConfigClient.getStatus();
    setStatus(result.ok ? result.value : null);
  }, []);

  useEffect(() => {
    let active = true;
    void providerConfigClient.getStatus().then((result) => {
      if (active) setStatus(result.ok ? result.value : null);
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === undefined) {
    return (
      <span aria-label={t('loading')} className={styles.modelLoading}>
        <Spin dot size={14} />
      </span>
    );
  }

  const activeCredential = status?.configured ? status.providers[status.activeProvider] : null;

  if (status?.configured && activeCredential?.state === 'NEEDS_RECONFIGURATION') {
    return (
      <ProviderConfigGate onConfigured={setStatus}>
        {({ open }) => (
          <Button
            className={styles.modelNeedsAttention}
            icon={<IconExclamationCircleFill aria-hidden="true" />}
            onClick={open}
            status="warning"
          >
            {providerT(
              status.activeProvider === 'STEPFUN'
                ? 'status.retainedUnavailable'
                : 'status.needsReconfiguration',
            )}
          </Button>
        )}
      </ProviderConfigGate>
    );
  }

  if (
    status?.configured &&
    activeCredential?.state === 'AVAILABLE' &&
    activeCredential.capabilities.fast === 'AVAILABLE'
  ) {
    const provider = providerT(
      status.activeProvider === 'STEPFUN' ? 'providers.stepfun.name' : 'providers.siliconflow.name',
    );
    return (
      <Link className={styles.modelReady} href="/settings/model">
        <IconCheckCircleFill aria-hidden="true" />
        <span>{provider}</span>
      </Link>
    );
  }

  if (status?.configured && activeCredential?.capabilities.fast === 'UNAVAILABLE') {
    return (
      <ProviderConfigGate onConfigured={setStatus}>
        {({ open }) => (
          <Button
            className={styles.modelNeedsAttention}
            icon={<IconExclamationCircleFill aria-hidden="true" />}
            onClick={open}
            status="warning"
          >
            {providerT('status.capabilityUnavailable')}
          </Button>
        )}
      </ProviderConfigGate>
    );
  }

  return (
    <ProviderConfigGate onConfigured={setStatus}>
      {({ open }) => (
        <Button
          className={styles.headerControl}
          icon={<IconSafe aria-hidden="true" />}
          onClick={status === null ? () => void loadStatus() : open}
        >
          {status === null ? t('retry') : providerT('actions.open')}
        </Button>
      )}
    </ProviderConfigGate>
  );
}
