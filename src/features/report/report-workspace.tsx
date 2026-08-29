import { Alert, Button, Empty, Radio, Select, Tag, Typography } from '@arco-design/web-react';
import {
  IconCopy,
  IconDownload,
  IconFile,
  IconRefresh,
  IconSafe,
} from '@arco-design/web-react/icon';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { MeetingAggregate } from '@/modules/meeting-db';
import {
  supportedLocales,
  type MeetingReport,
  type SupportedLocale,
} from '@/modules/meeting-domain';
import { buildReportFacts } from '@/modules/report-domain';

import { copyReportMarkdown, downloadReportMarkdown } from './browser-actions';
import type { GeneratedMeetingReport, GenerateMeetingReportCommand } from './commands';
import type { ReportMermaidRenderer } from './mermaid-diagram';
import { ReportMarkdown } from './report-markdown';
import styles from './report.module.css';

interface ReportCandidate {
  meetingUpdatedAt: string;
  report: MeetingReport;
}

export interface ReportWorkspaceViewProps {
  aggregate: MeetingAggregate;
  copyMarkdown?: (markdown: string) => Promise<void>;
  downloadMarkdown?: (markdown: string) => void;
  onGenerate: GenerateMeetingReportCommand;
  renderMermaid?: ReportMermaidRenderer;
  timezone: string;
}

function newerReport(
  persisted: ReportCandidate | undefined,
  generated: GeneratedMeetingReport | undefined,
): ReportCandidate | undefined {
  const local = generated && {
    meetingUpdatedAt: generated.meeting.updatedAt,
    report: generated.report,
  };
  if (persisted === undefined) return local;
  if (local === undefined) return persisted;
  return Date.parse(local.report.generatedAt) > Date.parse(persisted.report.generatedAt)
    ? local
    : persisted;
}

export function ReportWorkspaceView({
  aggregate,
  copyMarkdown = copyReportMarkdown,
  downloadMarkdown = downloadReportMarkdown,
  onGenerate,
  renderMermaid,
  timezone,
}: ReportWorkspaceViewProps) {
  const t = useTranslations('report');
  const meetingT = useTranslations('meeting');
  const format = useFormatter();
  const [locale, setLocale] = useState<SupportedLocale>(
    aggregate.meeting.report?.locale ?? aggregate.meeting.contentLocale,
  );
  const [generated, setGenerated] = useState<GeneratedMeetingReport>();
  const [view, setView] = useState<'preview' | 'source'>('preview');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<'copied' | 'factDraft' | 'saved'>();
  const [error, setError] = useState<
    'copyFailed' | 'downloadFailed' | 'generationFailed' | 'generationFailedEmpty'
  >();
  const facts = useMemo(() => buildReportFacts(aggregate, timezone), [aggregate, timezone]);
  const persisted = aggregate.meeting.report && {
    meetingUpdatedAt: aggregate.meeting.updatedAt,
    report: aggregate.meeting.report,
  };
  const current = newerReport(persisted, generated);
  const activeGeneration = useRef<AbortController | undefined>(undefined);

  useEffect(
    () => () => {
      activeGeneration.current?.abort();
    },
    [],
  );

  if (!facts.ok) {
    return <Alert content={t('errors.invalidMeeting')} showIcon type="warning" />;
  }

  const personHours = Math.round((facts.value.totalPersonMinutes / 60) * 10) / 10;
  const stale =
    current !== undefined && current.report.sourceUpdatedAt !== current.meetingUpdatedAt;

  async function handleGenerate() {
    const controller = new AbortController();
    activeGeneration.current?.abort();
    activeGeneration.current = controller;
    setError(undefined);
    setNotice(undefined);
    setPending(true);
    try {
      const result = await onGenerate(locale, controller.signal);
      if (controller.signal.aborted || activeGeneration.current !== controller) return;
      if (!result.ok) {
        setError(current ? 'generationFailed' : 'generationFailedEmpty');
        return;
      }
      setGenerated(result.value);
      setNotice(result.value.draft.usedFactDraft ? 'factDraft' : 'saved');
    } catch {
      if (controller.signal.aborted || activeGeneration.current !== controller) return;
      setError(current ? 'generationFailed' : 'generationFailedEmpty');
    } finally {
      if (activeGeneration.current === controller) {
        activeGeneration.current = undefined;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }

  async function handleCopy() {
    if (current === undefined) return;
    setError(undefined);
    try {
      await copyMarkdown(current.report.markdown);
      setNotice('copied');
    } catch {
      setError('copyFailed');
    }
  }

  function handleDownload() {
    if (current === undefined) return;
    setError(undefined);
    try {
      downloadMarkdown(current.report.markdown);
    } catch {
      setError('downloadFailed');
    }
  }

  return (
    <section aria-label={t('title')} className={styles.workspace}>
      <div className={styles.header}>
        <div className={styles.headingCopy}>
          <div className={styles.eyebrow}>
            <IconFile aria-hidden="true" />
            <span>{t('title')}</span>
          </div>
          <Typography.Title className={styles.title} heading={2}>
            {aggregate.meeting.title}
          </Typography.Title>
          <Typography.Paragraph className={styles.description}>
            {t('description')}
          </Typography.Paragraph>
        </div>
        <Tag className={styles.localTag} icon={<IconSafe aria-hidden="true" />}>
          {t('status.localOnly')}
        </Tag>
      </div>

      <div aria-label={t('labels.reportSummary')} className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span>{t('document.labels.mode')}</span>
          <strong>{t(`document.modes.${facts.value.mode}`)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>{t('labels.outcomes')}</span>
          <strong>{format.number(facts.value.outcomes.length)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>{t('labels.personHours')}</span>
          <strong>{meetingT('live.personHourValue', { value: personHours })}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>{t('labels.overtime')}</span>
          <strong>
            {meetingT('live.minuteValue', {
              value: format.number(Math.ceil(facts.value.overtimeMinutes)),
            })}
          </strong>
        </div>
      </div>

      <div className={styles.controls}>
        <label className={styles.languageField}>
          <span>{t('labels.language')}</span>
          <Select
            aria-label={t('labels.language')}
            disabled={pending}
            onChange={(value) => setLocale(value as SupportedLocale)}
            value={locale}
          >
            {supportedLocales.map((supportedLocale) => (
              <Select.Option key={supportedLocale} value={supportedLocale}>
                {t(`languages.${supportedLocale}`)}
              </Select.Option>
            ))}
          </Select>
        </label>
        <Button
          icon={current ? <IconRefresh /> : <IconFile />}
          loading={pending}
          onClick={() => void handleGenerate()}
          type="primary"
        >
          {t(current ? 'actions.regenerate' : 'actions.generate')}
        </Button>
      </div>

      <div aria-atomic="true" aria-live="polite" className={styles.noticeRegion}>
        {pending ? <Alert content={t('status.generating')} showIcon type="info" /> : null}
        {notice ? <Alert content={t(`feedback.${notice}`)} showIcon type="success" /> : null}
        {error ? <Alert content={t(`errors.${error}`)} showIcon type="error" /> : null}
        {stale ? <Alert content={t('status.stale')} showIcon type="warning" /> : null}
      </div>

      {current === undefined ? (
        <div className={styles.emptyState}>
          <Typography.Title heading={5}>{t('empty.title')}</Typography.Title>
          <Empty description={t('empty.description')} icon={<IconFile />} />
        </div>
      ) : (
        <div className={styles.documentPanel}>
          <div className={styles.documentToolbar}>
            <Radio.Group
              aria-label={t('labels.reportView')}
              onChange={setView}
              type="button"
              value={view}
            >
              <Radio value="preview">{t('actions.preview')}</Radio>
              <Radio value="source">{t('actions.source')}</Radio>
            </Radio.Group>
            <div className={styles.documentActions}>
              <Button icon={<IconCopy />} onClick={() => void handleCopy()}>
                {t('actions.copy')}
              </Button>
              <Button icon={<IconDownload />} onClick={handleDownload}>
                {t('actions.download')}
              </Button>
            </div>
          </div>
          {view === 'preview' ? (
            <ReportMarkdown markdown={current.report.markdown} renderMermaid={renderMermaid} />
          ) : (
            <pre aria-label={t('labels.source')} className={styles.source}>
              <code>{current.report.markdown}</code>
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
