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
  IconBranch,
  IconClockCircle,
  IconDelete,
  IconExperiment,
  IconPlus,
  IconRefresh,
  IconStorage,
  IconUserGroup,
} from '@arco-design/web-react/icon';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { AppHeader } from '@/features/app-shell';
import { Link } from '@/i18n/navigation';
import {
  calculateMeetingEconomics,
  type Meeting,
  type MeetingMode,
} from '@/modules/meeting-domain';
import {
  getBrowserMeetingDatabase,
  MeetingRepository,
  observeDashboardMeetings,
  type DashboardMeeting,
} from '@/modules/meeting-db/client';

import styles from './dashboard-home.module.css';
import { groupMeetings, meetingCardTimingKey, staleLiveMeetings } from './meeting-groups';

const modeColor: Record<MeetingMode, 'arcoblue' | 'cyan' | 'gray' | 'purple'> = {
  BRAINSTORM: 'purple',
  DECISION: 'arcoblue',
  GENERAL: 'gray',
  RETRO: 'cyan',
};

function modeKey(mode: MeetingMode | undefined) {
  return mode?.toLowerCase() ?? 'unselected';
}

interface MeetingCardProps {
  activeTopicTitle?: string;
  meeting: Meeting;
  now: Date;
  onDelete: (meeting: Meeting) => Promise<void>;
}

function MeetingCard({ activeTopicTitle, meeting, now, onDelete }: MeetingCardProps) {
  const t = useTranslations('dashboard');
  const format = useFormatter();
  const [deleting, setDeleting] = useState(false);
  const start = new Date(meeting.scheduledStartAt);
  const end = new Date(meeting.scheduledEndAt);
  const economics =
    meeting.status === 'LIVE' ? calculateMeetingEconomics(meeting, [], now) : undefined;
  const liveDurationMinutes =
    economics?.ok && meeting.actualAttendeeCount
      ? Math.max(0, Math.round(economics.value.totalPersonMinutes / meeting.actualAttendeeCount))
      : undefined;
  const livePersonHours = economics?.ok
    ? Math.round((economics.value.totalPersonMinutes / 60) * 10) / 10
    : undefined;

  return (
    <Card className={styles.meetingCard}>
      <div className={styles.cardTopline}>
        <Space size="small" wrap>
          <Tag color={meeting.mode ? modeColor[meeting.mode] : 'gray'}>
            {t(`modes.${modeKey(meeting.mode)}`)}
          </Tag>
          <Tag icon={<IconStorage aria-hidden="true" />}>{t('localMarker')}</Tag>
        </Space>
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
            className={styles.deleteButton}
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
          {meeting.status === 'LIVE' && liveDurationMinutes !== undefined ? (
            <span>
              <IconClockCircle aria-hidden="true" />
              {t('live.duration', { minutes: liveDurationMinutes })}
            </span>
          ) : null}
          {meeting.status === 'LIVE' ? (
            <span>
              <IconBranch aria-hidden="true" />
              {t('live.currentTopic', {
                topic: activeTopicTitle ?? t('live.noActiveTopic'),
              })}
            </span>
          ) : null}
          {meeting.status === 'LIVE' && livePersonHours !== undefined ? (
            <span>
              <IconUserGroup aria-hidden="true" />
              {t('live.personHours', { hours: livePersonHours })}
            </span>
          ) : null}
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
          <span className={styles.cardStateLabels}>
            <span>{t(`timing.${meetingCardTimingKey(meeting, now)}`)}</span>
            <span>{t(`stages.${meeting.preparationStage.toLowerCase()}`)}</span>
          </span>
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
  const [dashboardMeetings, setDashboardMeetings] = useState<DashboardMeeting[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(
    () =>
      observeDashboardMeetings(
        getBrowserMeetingDatabase(),
        (value) => {
          setDashboardMeetings(value);
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

  const meetings = useMemo(
    () => dashboardMeetings.map(({ meeting }) => meeting),
    [dashboardMeetings],
  );
  const activeTopicTitles = useMemo(
    () =>
      new Map(
        dashboardMeetings.map(({ activeTopicTitle, meeting }) => [meeting.id, activeTopicTitle]),
      ),
    [dashboardMeetings],
  );
  const groups = useMemo(() => groupMeetings(meetings, now), [meetings, now]);
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
                      <MeetingCard
                        activeTopicTitle={activeTopicTitles.get(meeting.id)}
                        key={meeting.id}
                        meeting={meeting}
                        now={now}
                        onDelete={deleteMeeting}
                      />
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
