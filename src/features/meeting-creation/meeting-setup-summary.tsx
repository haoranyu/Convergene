'use client';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Skeleton,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { IconArrowLeft, IconCheckCircleFill, IconRefresh } from '@arco-design/web-react/icon';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { AppHeader } from '@/features/app-shell';
import { meetingHref } from '@/features/meeting-navigation';
import { PersistedMeetingCanvas } from '@/features/meeting-room';
import { Link, useRouter } from '@/i18n/navigation';
import type { Meeting } from '@/modules/meeting-domain';
import { getBrowserMeetingDatabase, observeMeetingAggregate } from '@/modules/meeting-db/client';

import styles from './meeting-setup-summary.module.css';

export function MeetingSetupSummary({ meetingId }: { meetingId: string }) {
  const format = useFormatter();
  const router = useRouter();
  const t = useTranslations('meetingSetup');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | undefined>();
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(
    () =>
      observeMeetingAggregate(
        getBrowserMeetingDatabase(),
        meetingId,
        (aggregate) => {
          setMeeting(aggregate?.meeting);
          setLoading(false);
        },
        () => {
          setError(true);
          setLoading(false);
        },
      ),
    [meetingId, reloadToken],
  );

  const meetingDestination = meeting ? meetingHref(meeting) : undefined;
  const shouldResumePreparation = meetingDestination === `/meetings/${meetingId}/prepare`;

  useEffect(() => {
    if (!loading && !error && shouldResumePreparation && meetingDestination) {
      router.replace(meetingDestination);
    }
  }, [error, loading, meetingDestination, router, shouldResumePreparation]);

  if (!loading && !error && meeting?.preparationStage === 'MAP_READY') {
    return (
      <>
        <AppHeader title={meeting.title} />
        <PersistedMeetingCanvas meetingId={meetingId} />
      </>
    );
  }

  if (!loading && !error && meeting && shouldResumePreparation) {
    return (
      <>
        <AppHeader title={meeting.title} />
        <main className={styles.shell}>
          <div aria-busy="true" aria-label={t('loading')}>
            <Skeleton animation text={{ rows: 6 }} />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title={meeting?.title ?? t('pageTitle')} />
      <main className={styles.shell}>
        <Link className={styles.backLink} href="/">
          <IconArrowLeft aria-hidden="true" />
          {t('actions.back')}
        </Link>

        {loading ? (
          <div aria-busy="true" aria-label={t('loading')}>
            <Skeleton animation text={{ rows: 6 }} />
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <Alert content={t('errors.load')} showIcon type="error" />
            <Button
              icon={<IconRefresh />}
              onClick={() => {
                setError(false);
                setLoading(true);
                setReloadToken((value) => value + 1);
              }}
            >
              {t('actions.retry')}
            </Button>
          </div>
        ) : !meeting ? (
          <Empty description={t('notFound')} />
        ) : (
          <div className={styles.content}>
            <section className={styles.titleBlock}>
              <Tag color="green" icon={<IconCheckCircleFill />}>
                {t(`stages.${meeting.preparationStage.toLowerCase()}`)}
              </Tag>
              <Typography.Title heading={1}>{meeting.title}</Typography.Title>
              <Typography.Paragraph>{t('lockedDescription')}</Typography.Paragraph>
            </section>

            <Card className={styles.summaryCard} title={t('summaryTitle')}>
              <Descriptions
                border
                column={1}
                data={[
                  {
                    label: t('fields.mode'),
                    value: t(`modes.${meeting.mode?.toLowerCase() ?? 'unselected'}`),
                  },
                  {
                    label: t('fields.schedule'),
                    value: format.dateTimeRange(
                      new Date(meeting.scheduledStartAt),
                      new Date(meeting.scheduledEndAt),
                      { dateStyle: 'medium', timeStyle: 'short' },
                    ),
                  },
                  {
                    label: t('fields.attendees'),
                    value: t('attendeeCount', { count: meeting.expectedAttendeeCount }),
                  },
                  { label: t('fields.locale'), value: t(`locales.${meeting.contentLocale}`) },
                ]}
              />
              <div className={styles.rawRequest}>
                <Typography.Text bold>{t('fields.rawRequest')}</Typography.Text>
                <Typography.Paragraph>{meeting.rawRequest}</Typography.Paragraph>
              </div>
            </Card>

            <Alert content={t('restartRule')} showIcon title={t('nextTitle')} type="info" />
          </div>
        )}
      </main>
    </>
  );
}
