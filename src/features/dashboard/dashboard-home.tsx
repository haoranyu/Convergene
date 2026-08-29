'use client';

import {
  Alert,
  Button,
  Card,
  Empty,
  Popconfirm,
  Skeleton,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react';
import {
  IconCalendar,
  IconClockCircle,
  IconDelete,
  IconExperiment,
  IconPlus,
  IconRefresh,
  IconUserGroup,
} from '@arco-design/web-react/icon';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { AppHeader } from '@/features/app-shell';
import { Link } from '@/i18n/navigation';
import type { Meeting, MeetingMode } from '@/modules/meeting-domain';
import {
  getBrowserMeetingDatabase,
  MeetingRepository,
  observeMeetings,
} from '@/modules/meeting-db/client';

import styles from './dashboard-home.module.css';
import { groupMeetings, staleLiveMeetings } from './meeting-groups';

const modeColor: Record<MeetingMode, 'arcoblue' | 'gray' | 'green' | 'orange'> = {
  BRAINSTORM: 'orange',
  DECISION: 'arcoblue',
  GENERAL: 'gray',
  RETRO: 'green',
};

function modeKey(mode: MeetingMode | undefined) {
  return mode?.toLowerCase() ?? 'unselected';
}

function stageKey(meeting: Meeting): string {
  if (meeting.status === 'LIVE') return 'live';
  if (meeting.status === 'ENDED') return 'ended';
  return meeting.preparationStage.toLowerCase();
}

interface MeetingCardProps {
  meeting: Meeting;
  onDelete: (meeting: Meeting) => Promise<void>;
}

function MeetingCard({ meeting, onDelete }: MeetingCardProps) {
  const t = useTranslations('dashboard');
  const format = useFormatter();
  const [deleting, setDeleting] = useState(false);
  const start = new Date(meeting.scheduledStartAt);
  const end = new Date(meeting.scheduledEndAt);

  return (
    <Card className={styles.meetingCard} hoverable>
      <div className={styles.cardTopline}>
        <Tag color={meeting.mode ? modeColor[meeting.mode] : 'gray'}>
          {t(`modes.${modeKey(meeting.mode)}`)}
        </Tag>
        <Popconfirm
          content={t('delete.description')}
          disabled={deleting}
          onOk={async () => {
            setDeleting(true);
            try {
              await onDelete(meeting);
            } finally {
              setDeleting(false);
            }
          }}
          title={t('delete.title', { title: meeting.title })}
        >
          <Button
            aria-label={t('delete.actionLabel', { title: meeting.title })}
            icon={<IconDelete aria-hidden="true" />}
            loading={deleting}
            size="small"
            status="danger"
            type="text"
          />
        </Popconfirm>
      </div>
      <Link className={styles.cardLink} href={`/meetings/${meeting.id}`}>
        <Typography.Title className={styles.cardTitle} heading={5}>
          {meeting.title}
        </Typography.Title>
        <div className={styles.cardMeta}>
          <span>
            <IconCalendar aria-hidden="true" />
            {format.dateTime(start, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <span>
            <IconClockCircle aria-hidden="true" />
            {format.dateTimeRange(start, end, { timeStyle: 'short' })}
          </span>
          <span>
            <IconUserGroup aria-hidden="true" />
            {t('attendees', { count: meeting.expectedAttendeeCount })}
          </span>
        </div>
        <div className={styles.cardFooter}>
          <span>{t(`stages.${stageKey(meeting)}`)}</span>
          <span aria-hidden="true">→</span>
        </div>
      </Link>
    </Card>
  );
}

export function DashboardHome() {
  const t = useTranslations('dashboard');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(
    () =>
      observeMeetings(
        getBrowserMeetingDatabase(),
        (value) => {
          setMeetings(value);
          setLoading(false);
        },
        () => {
          setError(true);
          setLoading(false);
        },
      ),
    [reloadToken],
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const groups = useMemo(() => groupMeetings(meetings), [meetings]);
  const stale = useMemo(() => staleLiveMeetings(meetings, now), [meetings, now]);

  async function deleteMeeting(meeting: Meeting) {
    const result = await new MeetingRepository(getBrowserMeetingDatabase()).deleteMeeting(
      meeting.id,
    );
    if (!result.ok) setError(true);
  }

  return (
    <>
      <AppHeader title={t('pageTitle')} />
      <main className={styles.shell}>
        {stale.length > 0 ? (
          <Alert
            className={styles.recoveryBanner}
            content={t('staleLive.description', { count: stale.length })}
            showIcon
            title={t('staleLive.title')}
            type="warning"
          />
        ) : null}

        <section className={styles.hero}>
          <div>
            <Typography.Text className={styles.eyebrow}>{t('eyebrow')}</Typography.Text>
            <Typography.Title className={styles.heroTitle} heading={1}>
              {t('title')}
            </Typography.Title>
            <Typography.Paragraph className={styles.heroDescription}>
              {t('description')}
            </Typography.Paragraph>
          </div>
          <Space className={styles.heroActions} wrap>
            <Link className={styles.primaryLink} href="/meetings/new">
              <IconPlus aria-hidden="true" />
              {t('actions.new')}
            </Link>
            <Link className={styles.secondaryLink} href="/guide">
              <IconExperiment aria-hidden="true" />
              {t('actions.guide')}
            </Link>
          </Space>
        </section>

        {loading ? (
          <div aria-busy="true" aria-label={t('loading')} className={styles.loadingGrid}>
            <Skeleton animation text={{ rows: 4 }} />
            <Skeleton animation text={{ rows: 4 }} />
          </div>
        ) : error ? (
          <section className={styles.errorState}>
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
          </section>
        ) : meetings.length === 0 ? (
          <section className={styles.emptyState}>
            <Empty description={t('empty.description')} />
            <Typography.Text>{t('empty.modes')}</Typography.Text>
          </section>
        ) : (
          <div className={styles.groups}>
            {groups.map((group) =>
              group.meetings.length > 0 ? (
                <section className={styles.group} key={group.id}>
                  <div className={styles.groupHeading}>
                    <Typography.Title heading={3}>{t(`groups.${group.id}.title`)}</Typography.Title>
                    <Typography.Text>
                      {t(`groups.${group.id}.count`, { count: group.meetings.length })}
                    </Typography.Text>
                  </div>
                  <div className={styles.meetingGrid}>
                    {group.meetings.map((meeting) => (
                      <MeetingCard key={meeting.id} meeting={meeting} onDelete={deleteMeeting} />
                    ))}
                  </div>
                </section>
              ) : null,
            )}
          </div>
        )}
      </main>
    </>
  );
}
