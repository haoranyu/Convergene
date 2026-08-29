'use client';

import { Alert, Button, Form, InputNumber, Modal, Tag, Typography } from '@arco-design/web-react';
import { IconCheck, IconExclamationCircle } from '@arco-design/web-react/icon';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  buildMeetingEndCheck,
  outcomeKinds,
  type Meeting,
  type MeetingOutcome,
} from '@/modules/meeting-domain';
import type { MindMapNode } from '@/modules/mind-map-domain';

import type { EndMeetingCommand } from './contracts';
import { meetingCommandErrorKey } from './contracts';
import styles from './live-meeting.module.css';
import { useLiveClock } from './use-live-clock';

export interface EndMeetingDialogProps {
  fixedNow?: Date;
  meeting: Meeting;
  nodes: readonly Pick<MindMapNode, 'kind' | 'meetingId'>[];
  onCancel: () => void;
  onEnd: EndMeetingCommand;
  onEnded?: (meeting: Meeting) => void;
  open: boolean;
  outcomes: readonly MeetingOutcome[];
}

export function EndMeetingDialog({
  fixedNow,
  meeting,
  nodes,
  onCancel,
  onEnd,
  onEnded,
  open,
  outcomes,
}: EndMeetingDialogProps) {
  const t = useTranslations('meeting');
  const outcomeT = useTranslations('outcome');
  const format = useFormatter();
  const now = useLiveClock(fixedNow);
  const [attendeeCount, setAttendeeCount] = useState(meeting.actualAttendeeCount ?? 1);
  const [phase, setPhase] = useState<'confirm' | 'review'>('review');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  function reset() {
    setAttendeeCount(meeting.actualAttendeeCount ?? 1);
    setPhase('review');
    setBusy(false);
    setErrorKey(null);
  }

  const parkingLotCount = useMemo(
    () => nodes.filter((node) => node.meetingId === meeting.id && node.kind === 'PARKING').length,
    [meeting.id, nodes],
  );
  const check = buildMeetingEndCheck(meeting, outcomes, { parkingLotCount }, attendeeCount, now);

  async function end() {
    if (!check.ok) {
      setErrorKey(meetingCommandErrorKey(check.error.code));
      return;
    }

    setBusy(true);
    setErrorKey(null);
    try {
      const result = await onEnd(attendeeCount);
      if (result.ok) {
        onEnded?.(result.value);
        return;
      }
      setErrorKey(meetingCommandErrorKey(result.error.code));
      setPhase('review');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      autoFocus
      afterClose={reset}
      className={styles.dialog}
      escToExit
      focusLock
      footer={null}
      maskClosable={false}
      onCancel={busy ? undefined : onCancel}
      title={t(phase === 'review' ? 'end.title' : 'end.confirmTitle')}
      unmountOnExit
      visible={open}
    >
      {!check.ok ? (
        <Alert content={t(meetingCommandErrorKey(check.error.code))} showIcon type="error" />
      ) : phase === 'review' ? (
        <>
          <Typography.Paragraph className={styles.dialogIntro}>
            {t('end.description')}
          </Typography.Paragraph>

          {check.value.hasNoOutcomes ? (
            <Alert content={t('end.zeroOutcomeWarning')} showIcon type="warning" />
          ) : null}

          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.metricLabel}>{t('end.outcomeCount')}</span>
              <span className={styles.summaryValue}>{format.number(check.value.outcomeCount)}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.metricLabel}>{t('end.elapsed')}</span>
              <span className={styles.summaryValue}>
                {t('live.minuteValue', {
                  value: format.number(Math.ceil(check.value.elapsedMinutes)),
                })}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.metricLabel}>{t('end.personHours')}</span>
              <span className={styles.summaryValue}>
                {t('live.personHourValue', {
                  value: Math.round((check.value.economics.totalPersonMinutes / 60) * 10) / 10,
                })}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.metricLabel}>{t('end.overtime')}</span>
              <span className={styles.summaryValue}>
                {t('live.minuteValue', {
                  value: format.number(Math.ceil(check.value.economics.overtimeMinutes)),
                })}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.metricLabel}>{t('end.parkingLot')}</span>
              <span className={styles.summaryValue}>
                {format.number(check.value.parkingLotCount)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.metricLabel}>{t('end.unresolved')}</span>
              <span className={styles.summaryValue}>
                {format.number(check.value.unresolvedCount)}
              </span>
            </div>
          </div>

          <div aria-label={t('end.outcomeBreakdown')} className={styles.outcomeKinds}>
            {outcomeKinds.map((kind) => (
              <Tag key={kind}>
                {outcomeT(`kinds.${kind}`)} · {format.number(check.value.outcomesByKind[kind])}
              </Tag>
            ))}
          </div>

          {check.value.incompleteActionCount > 0 ? (
            <Alert
              content={t('end.actionGaps', {
                dueDateCount: check.value.actionMissingDueDateCount,
                ownerCount: check.value.actionMissingOwnerCount,
              })}
              showIcon
              type="warning"
            />
          ) : null}

          <Form layout="vertical">
            <Form.Item help={t('end.attendeeHelp')} label={t('end.actualAttendees')} required>
              <InputNumber
                aria-label={t('end.actualAttendees')}
                max={999}
                min={1}
                mode="button"
                onChange={(value) => {
                  setAttendeeCount(value ?? 0);
                  setErrorKey(null);
                }}
                precision={0}
                value={attendeeCount}
              />
            </Form.Item>
          </Form>
        </>
      ) : (
        <Alert
          content={t(
            check.value.hasNoOutcomes ? 'end.confirmZeroOutcomes' : 'end.confirmDescription',
          )}
          icon={<IconExclamationCircle />}
          showIcon
          type={check.value.hasNoOutcomes ? 'warning' : 'info'}
        />
      )}

      <div aria-atomic="true" aria-live="polite" className={styles.noticeRegion}>
        {errorKey ? <Alert content={t(errorKey)} showIcon type="error" /> : null}
      </div>

      <div className={styles.dialogActions}>
        <Button disabled={busy} onClick={phase === 'review' ? onCancel : () => setPhase('review')}>
          {phase === 'review' ? t('actions.returnToMeeting') : t('actions.backToCheck')}
        </Button>
        {phase === 'review' ? (
          <Button
            disabled={!check.ok}
            icon={<IconCheck />}
            onClick={() => setPhase('confirm')}
            type="primary"
          >
            {t('actions.continueToConfirm')}
          </Button>
        ) : (
          <Button loading={busy} onClick={() => void end()} status="danger" type="primary">
            {t('actions.confirmEnd')}
          </Button>
        )}
      </div>
    </Modal>
  );
}
