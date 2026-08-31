'use client';

import {
  Alert,
  Button,
  Card,
  Popconfirm,
  Progress,
  Space,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBranch,
  IconCheck,
  IconCopy,
  IconExperiment,
} from '@arco-design/web-react/icon';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { AppHeader } from '@/features/app-shell';
import { Link, useRouter } from '@/i18n/navigation';
import { buildLocalMeetingDraft } from '@/features/meeting-creation/local-meeting';
import { isSupportedLocale, type MeetingMode } from '@/modules/meeting-domain';
import { getBrowserMeetingDatabase, MeetingRepository } from '@/modules/meeting-db/client';

import styles from './guide-sandbox.module.css';

const scenarios = ['decision', 'brainstorm', 'retro'] as const;
type ScenarioId = (typeof scenarios)[number];

const scenarioModes: Record<ScenarioId, MeetingMode> = {
  brainstorm: 'BRAINSTORM',
  decision: 'DECISION',
  retro: 'RETRO',
};

const totalSteps = 5;

interface ExampleMapProps {
  expanded?: boolean;
  focused?: boolean;
  scenario: ScenarioId;
}

function ExampleMap({ expanded = false, focused = false, scenario }: ExampleMapProps) {
  const t = useTranslations('guide');
  return (
    <div aria-label={t('map.label')} className={styles.map} role="img">
      <div className={`${styles.mapNode} ${styles.rootNode}`}>
        {t(`fixtures.${scenario}.objective`)}
      </div>
      <div className={styles.topicRow}>
        {[1, 2, 3].map((index) => {
          const active = index === 2;
          return (
            <div
              className={`${styles.mapNode} ${styles.topicNode} ${focused && active ? styles.activeNode : ''} ${focused && !active ? styles.dimNode : ''}`}
              key={index}
            >
              <span>{t(`fixtures.${scenario}.topic${index}`)}</span>
              {expanded && active ? (
                <div className={styles.expansionList}>
                  {[1, 2, 3].map((child) => (
                    <span key={child}>{t(`fixtures.${scenario}.expansion${child}`)}</span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuideStep({ scenario, step }: { scenario: ScenarioId; step: number }) {
  const t = useTranslations('guide');

  if (step === 0) {
    return (
      <div className={styles.stepGrid}>
        <Card className={styles.explainerCard} title={t('steps.type.title')}>
          <Typography.Paragraph>{t(`fixtures.${scenario}.modeEffect`)}</Typography.Paragraph>
          <Tag color="arcoblue">{t(`fixtures.${scenario}.label`)}</Tag>
        </Card>
        <ExampleMap scenario={scenario} />
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className={styles.stepGrid}>
        <Card className={styles.explainerCard} title={t('steps.grill.title')}>
          <Typography.Title heading={3}>{t(`fixtures.${scenario}.question`)}</Typography.Title>
          <Typography.Paragraph>{t(`fixtures.${scenario}.reason`)}</Typography.Paragraph>
          <Tag>{t('sampleAnswer')}</Tag>
        </Card>
        <Card className={styles.readinessCard} title={t('readiness.title')}>
          <Typography.Paragraph>{t(`fixtures.${scenario}.readinessSummary`)}</Typography.Paragraph>
          <ul>
            <li>
              <Tag color="green">{t('readiness.confirmed')}</Tag>
            </li>
            <li>
              <Tag color="orange">{t('readiness.partial')}</Tag>
            </li>
            <li>
              <Tag color="red">{t('readiness.missing')}</Tag>
            </li>
          </ul>
        </Card>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className={styles.fullStep}>
        <Alert
          content={t('steps.focus.description')}
          showIcon
          title={t('steps.focus.title')}
          type="info"
        />
        <Card className={styles.cheatCard} title={t('steps.focus.cheatTitle')}>
          <Typography.Paragraph>{t(`fixtures.${scenario}.cheat`)}</Typography.Paragraph>
        </Card>
        <ExampleMap focused scenario={scenario} />
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className={styles.fullStep}>
        <div className={styles.sampleHeading}>
          <div>
            <Typography.Title heading={3}>{t('steps.play.title')}</Typography.Title>
            <Typography.Paragraph>{t('steps.play.description')}</Typography.Paragraph>
          </div>
          <Tag icon={<IconExperiment />} color="orange">
            {t('sampleResult')}
          </Tag>
        </div>
        <ExampleMap expanded focused scenario={scenario} />
      </div>
    );
  }

  return (
    <div className={styles.stepGrid}>
      <Card className={styles.outcomesCard} title={t('steps.outcomes.outputTitle')}>
        <ul>
          {[1, 2, 3].map((index) => (
            <li key={index}>
              <IconCheck aria-hidden="true" />
              <span>{t(`fixtures.${scenario}.outcome${index}`)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className={styles.reportCard} title={t('steps.outcomes.reportTitle')}>
        <pre>{t(`fixtures.${scenario}.report`)}</pre>
      </Card>
    </div>
  );
}

export function GuideSandbox() {
  const t = useTranslations('guide');
  const localeValue = useLocale();
  const locale = isSupportedLocale(localeValue) ? localeValue : 'zh-CN';
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>('decision');
  const [step, setStep] = useState(0);

  async function copyExample() {
    setCopying(true);
    setNotice(null);
    try {
      const now = new Date();
      const start = new Date(now.getTime() + 60 * 60 * 1_000);
      const end = new Date(start.getTime() + 60 * 60 * 1_000);
      const draft = buildLocalMeetingDraft(
        {
          contentLocale: locale,
          expectedAttendeeCount: 5,
          rawRequest: t(`fixtures.${scenario}.rawRequest`),
          scheduledEndAt: end.toISOString(),
          scheduledStartAt: start.toISOString(),
          title: t(`fixtures.${scenario}.title`),
        },
        now,
      );
      const saved = await new MeetingRepository(
        getBrowserMeetingDatabase(),
      ).createMeetingForPreparation(
        draft,
        scenarioModes[scenario],
        t(`fixtures.${scenario}.copyReason`),
        now,
      );
      if (!saved.ok) {
        setNotice(t('copy.error'));
        return;
      }
      router.push(`/meetings/${saved.value.id}/prepare`);
    } catch {
      setNotice(t('copy.error'));
    } finally {
      setCopying(false);
    }
  }

  const finalStep = step === totalSteps - 1;
  const copyAction = (
    <Popconfirm
      content={t('copy.confirmDescription')}
      disabled={copying}
      onOk={() => void copyExample()}
      title={t('copy.confirmTitle')}
    >
      <Button
        className={styles.copyAction}
        icon={<IconCopy aria-hidden="true" />}
        loading={copying}
        type={finalStep ? 'primary' : 'outline'}
      >
        {t('actions.copy')}
      </Button>
    </Popconfirm>
  );

  return (
    <>
      <AppHeader title={t('pageTitle')} />
      <main className={styles.shell}>
        <div className={styles.titleRow}>
          <div>
            <Typography.Text className={styles.eyebrow}>{t('eyebrow')}</Typography.Text>
            <Typography.Title heading={1}>{t('title')}</Typography.Title>
            <Typography.Paragraph>{t('description')}</Typography.Paragraph>
          </div>
          <Link className={styles.exitLink} href="/">
            {t('actions.exit')}
          </Link>
        </div>

        <Tabs
          activeTab={scenario}
          aria-label={t('scenarioLabel')}
          className={styles.scenarioTabs}
          onChange={(value) => {
            setScenario(value as ScenarioId);
            setStep(0);
          }}
          type="rounded"
        >
          {scenarios.map((id) => (
            <Tabs.TabPane
              key={id}
              title={
                <span aria-label={t(`fixtures.${id}.label`)}>{t(`fixtures.${id}.tabLabel`)}</span>
              }
            />
          ))}
        </Tabs>

        <section aria-labelledby="guide-step-title" className={styles.tourFrame}>
          <div className={styles.progressHeader}>
            <div>
              <Typography.Text>
                {t('progress', { current: step + 1, total: totalSteps })}
              </Typography.Text>
              <Typography.Title heading={2} id="guide-step-title">
                {t(`steps.${['type', 'grill', 'focus', 'play', 'outcomes'][step]}.title`)}
              </Typography.Title>
            </div>
            <Progress percent={((step + 1) / totalSteps) * 100} showText={false} />
          </div>

          <div className={styles.controls}>
            {finalStep ? copyAction : null}
            <Space wrap>
              <Button
                disabled={step === 0}
                icon={<IconArrowLeft aria-hidden="true" />}
                onClick={() => setStep((value) => Math.max(0, value - 1))}
              >
                {t('actions.previous')}
              </Button>
              {!finalStep ? (
                <Button
                  icon={<IconArrowRight aria-hidden="true" />}
                  iconOnly={false}
                  onClick={() => setStep((value) => Math.min(totalSteps - 1, value + 1))}
                  type="primary"
                >
                  {t('actions.next')}
                </Button>
              ) : null}
            </Space>
            {!finalStep ? copyAction : null}
          </div>

          <GuideStep scenario={scenario} step={step} />
        </section>

        <div aria-live="polite">
          {notice ? <Alert content={notice} showIcon type="error" /> : null}
        </div>
        <div className={styles.privacyNote}>
          <IconBranch aria-hidden="true" />
          <span>{t('memoryOnly')}</span>
        </div>
      </main>
    </>
  );
}
