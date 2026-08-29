'use client';

import { Alert, Button, Drawer, Popconfirm, Space, Tag, Typography } from '@arco-design/web-react';
import { IconDelete, IconDownload, IconSafe, IconStorage } from '@arco-design/web-react/icon';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import {
  createExportSnapshot,
  exportFilename,
  getBrowserMeetingDatabase,
  MeetingRepository,
  serializeExport,
} from '@/modules/meeting-db/client';

import styles from './app-shell.module.css';

type DataOperation = 'clear' | 'export' | null;

function downloadTextFile(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function LocalDataDrawer() {
  const t = useTranslations('appShell.data');
  const [open, setOpen] = useState(false);
  const [operation, setOperation] = useState<DataOperation>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function exportData() {
    setOperation('export');
    setNotice(null);
    try {
      const now = new Date();
      const snapshot = await createExportSnapshot(getBrowserMeetingDatabase(), now);
      if (!snapshot.ok) {
        setNotice({ kind: 'error', text: t('errors.export') });
        return;
      }
      downloadTextFile(exportFilename(now), serializeExport(snapshot.value));
      setNotice({ kind: 'success', text: t('feedback.exported') });
    } catch {
      setNotice({ kind: 'error', text: t('errors.export') });
    } finally {
      setOperation(null);
    }
  }

  async function clearMeetings() {
    setOperation('clear');
    setNotice(null);
    try {
      await new MeetingRepository(getBrowserMeetingDatabase()).clearAllMeetingData();
      setNotice({ kind: 'success', text: t('feedback.cleared') });
    } catch {
      setNotice({ kind: 'error', text: t('errors.clear') });
    } finally {
      setOperation(null);
    }
  }

  return (
    <>
      <Button
        className={styles.headerControl}
        icon={<IconStorage aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        {t('trigger')}
      </Button>
      <Drawer
        autoFocus
        focusLock
        footer={null}
        onCancel={() => setOpen(false)}
        title={t('title')}
        visible={open}
        width={440}
      >
        <section
          aria-label={t('title')}
          aria-modal="true"
          className={styles.dataDrawerBody}
          role="dialog"
        >
          <Alert content={t('localNotice')} showIcon type="info" />

          <section className={styles.dataSection}>
            <div className={styles.dataSectionIcon} aria-hidden="true">
              <IconStorage />
            </div>
            <div>
              <Typography.Title heading={6}>{t('meetingData.title')}</Typography.Title>
              <Typography.Paragraph>{t('meetingData.description')}</Typography.Paragraph>
              <Space wrap>
                <Button
                  icon={<IconDownload aria-hidden="true" />}
                  loading={operation === 'export'}
                  onClick={() => void exportData()}
                >
                  {t('actions.export')}
                </Button>
                <Popconfirm
                  content={t('clear.confirmDescription')}
                  disabled={operation !== null}
                  onOk={() => void clearMeetings()}
                  title={t('clear.confirmTitle')}
                >
                  <Button
                    icon={<IconDelete aria-hidden="true" />}
                    loading={operation === 'clear'}
                    status="danger"
                  >
                    {t('actions.clear')}
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          </section>

          <section className={styles.dataSection}>
            <div className={styles.dataSectionIcon} aria-hidden="true">
              <IconSafe />
            </div>
            <div>
              <Typography.Title heading={6}>{t('modelData.title')}</Typography.Title>
              <Typography.Paragraph>{t('modelData.description')}</Typography.Paragraph>
              <Link className={styles.inlineLink} href="/settings/model">
                {t('actions.manageModel')}
              </Link>
            </div>
          </section>

          <section className={styles.cloudSection}>
            <div>
              <Space align="center" wrap>
                <Typography.Title heading={6}>{t('cloud.title')}</Typography.Title>
                <Tag>{t('cloud.comingSoon')}</Tag>
              </Space>
              <Typography.Paragraph>{t('cloud.description')}</Typography.Paragraph>
            </div>
          </section>

          <div aria-atomic="true" aria-live="polite">
            {notice ? (
              <Alert
                content={notice.text}
                showIcon
                type={notice.kind === 'success' ? 'success' : 'error'}
              />
            ) : null}
          </div>
        </section>
      </Drawer>
    </>
  );
}
