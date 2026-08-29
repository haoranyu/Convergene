'use client';

import { Button, Spin } from '@arco-design/web-react';
import { IconCheckCircleFill, IconSafe } from '@arco-design/web-react/icon';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { providerConfigClient, ProviderConfigGate } from '@/features/provider-config';
import { Link } from '@/i18n/navigation';
import type { ProviderConfigSummary } from '@/modules/provider-config';

import styles from './app-shell.module.css';

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

  if (status?.configured) {
    const provider = providerT(
      status.provider === 'STEPFUN' ? 'providers.stepfun.name' : 'providers.siliconflow.name',
    );
    return (
      <Link className={styles.modelReady} href="/settings/model">
        <IconCheckCircleFill aria-hidden="true" />
        <span>{provider}</span>
      </Link>
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
