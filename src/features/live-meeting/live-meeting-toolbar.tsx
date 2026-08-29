'use client';

import { Alert, Button, Tag } from '@arco-design/web-react';
import { IconClockCircle, IconPoweroff } from '@arco-design/web-react/icon';
import { useFormatter, useTranslations } from 'next-intl';

import { calculateMeetingEconomics, deriveTimingState } from '@/modules/meeting-domain';
import type { Meeting, MeetingOutcome } from '@/modules/meeting-domain';

import styles from './live-meeting.module.css';
import { formatElapsedClock, useLiveClock } from './use-live-clock';

export interface LiveMeetingToolbarProps {
  fixedNow?: Date;
  meeting: Meeting;
  onEndRequest: () => void;
  outcomes: readonly MeetingOutcome[];
}

export function LiveMeetingToolbar({
  fixedNow,
  meeting,
  onEndRequest,
  outcomes,
}: LiveMeetingToolbarProps) {
  const t = useTranslations('meeting');
  const format = useFormatter();
  const now = useLiveClock(fixedNow);
  const economics = calculateMeetingEconomics(meeting, outcomes, now);
  const attendeeCount = meeting.actualAttendeeCount;

  if (
    meeting.status !== 'LIVE' ||
    meeting.startedAt === undefined ||
    attendeeCount === undefined ||
    !economics.ok
  ) {
    return <Alert content={t('errors.invalidMeetingState')} showIcon type="error" />;
  }

  const timingState = deriveTimingState(meeting, now);
  const isOverrun = timingState === 'LIVE_OVERRUN';
  const personHours = economics.value.totalPersonMinutes / 60;

  return (
    <section aria-label={t('live.summaryLabel')} className={styles.toolbar}>
      <div aria-atomic="true" aria-live="off" className={styles.toolbarMetrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{t('live.status')}</span>
          <span className={styles.metricValue}>
            <Tag color={isOverrun ? 'orange' : 'green'} icon={<IconClockCircle />}>
              {t(isOverrun ? 'live.overrun' : 'live.inProgress')}
            </Tag>
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{t('live.elapsed')}</span>
          <span className={styles.metricValue}>{formatElapsedClock(meeting.startedAt, now)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{t('live.attendees')}</span>
          <span className={styles.metricValue}>
            {t('live.attendeeValue', { count: attendeeCount })}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{t('live.personHours')}</span>
          <span className={styles.metricValue}>
            {t('live.personHourValue', {
              value: Math.round(personHours * 10) / 10,
            })}
          </span>
        </div>
        {isOverrun ? (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>{t('live.overtime')}</span>
            <span className={`${styles.metricValue} ${styles.overrunValue}`}>
              {t('live.minuteValue', {
                value: format.number(Math.ceil(economics.value.overtimeMinutes)),
              })}
            </span>
          </div>
        ) : null}
      </div>
      <Button icon={<IconPoweroff />} onClick={onEndRequest} status="danger" type="outline">
        {t('actions.end')}
      </Button>
    </section>
  );
}
