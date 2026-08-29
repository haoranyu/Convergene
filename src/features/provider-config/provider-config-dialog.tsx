'use client';

import { Modal, Typography } from '@arco-design/web-react';
import { useTranslations } from 'next-intl';

import type { ProviderConfigSummary } from '@/modules/provider-config';

import type { ProviderConfigClient } from './api-client';
import { ProviderConfigPanel } from './provider-config-panel';
import styles from './provider-config-settings.module.css';

interface ProviderConfigDialogProps {
  api?: ProviderConfigClient;
  onAfterClose?: () => void;
  onClose: () => void;
  onConfigured?: (summary: ProviderConfigSummary) => void;
  open: boolean;
}

export function ProviderConfigDialog({
  api,
  onAfterClose,
  onClose,
  onConfigured,
  open,
}: ProviderConfigDialogProps) {
  const t = useTranslations('providerConfig');

  return (
    <Modal
      autoFocus
      afterClose={onAfterClose}
      className={styles.dialog}
      escToExit
      focusLock
      footer={null}
      maskClosable={false}
      onCancel={onClose}
      title={t('dialog.title')}
      unmountOnExit
      visible={open}
    >
      <Typography.Paragraph className={styles.dialogIntro}>
        {t('dialog.description')}
      </Typography.Paragraph>
      <ProviderConfigPanel api={api} compact onConfigured={onConfigured} />
    </Modal>
  );
}
