'use client';

import {
  Alert,
  Button,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Typography,
} from '@arco-design/web-react';
import { IconArrowRight, IconPlayArrow, IconPoweroff } from '@arco-design/web-react/icon';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { Meeting } from '@/modules/meeting-domain';

import type { StartMeetingCommand } from './contracts';
import { meetingCommandErrorKey } from './contracts';
import styles from './live-meeting.module.css';

export interface StartMeetingDialogProps {
  activeMeetingId?: string;
  meeting: Meeting;
  onCancel: () => void;
  onOpenActiveMeeting: (meetingId: string) => void;
  onRequestEndActiveMeeting: (meetingId: string) => void;
  onStarted?: (meeting: Meeting) => void;
  onStart: StartMeetingCommand;
  open: boolean;
}

export function StartMeetingDialog({
  activeMeetingId,
  meeting,
  onCancel,
  onOpenActiveMeeting,
  onRequestEndActiveMeeting,
  onStarted,
  onStart,
  open,
}: StartMeetingDialogProps) {
  const t = useTranslations('meeting');
  const format = useFormatter();
  const [attendeeCount, setAttendeeCount] = useState(meeting.expectedAttendeeCount);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const hasConflict = activeMeetingId !== undefined && activeMeetingId !== meeting.id;

  function reset() {
    setAttendeeCount(meeting.expectedAttendeeCount);
    setBusy(false);
    setErrorKey(null);
  }

  async function submit() {
    if (!Number.isInteger(attendeeCount) || attendeeCount <= 0) {
      setErrorKey('errors.invalidAttendeeCount');
      return;
    }

    setBusy(true);
    setErrorKey(null);
    try {
      const result = await onStart(attendeeCount);
      if (result.ok) {
        onStarted?.(result.value);
        return;
      }
      setErrorKey(meetingCommandErrorKey(result.error.code));
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
      title={t(hasConflict ? 'start.conflictTitle' : 'start.title')}
      unmountOnExit
      visible={open}
    >
      {hasConflict ? (
        <>
          <Alert content={t('start.conflictDescription')} showIcon type="warning" />
          <div className={styles.dialogActions}>
            <Button disabled={busy} onClick={onCancel}>
              {t('actions.cancel')}
            </Button>
            <Button
              icon={<IconPoweroff />}
              onClick={() => onRequestEndActiveMeeting(activeMeetingId)}
              status="danger"
              type="outline"
            >
              {t('actions.reviewAndEndLive')}
            </Button>
            <Button
              icon={<IconArrowRight />}
              onClick={() => onOpenActiveMeeting(activeMeetingId)}
              type="primary"
            >
              {t('actions.returnToLive')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Typography.Paragraph className={styles.dialogIntro}>
            {t('start.description')}
          </Typography.Paragraph>
          <Descriptions
            border
            column={1}
            data={[
              {
                label: t('start.schedule'),
                value: t('start.scheduleValue', {
                  end: format.dateTime(new Date(meeting.scheduledEndAt), {
                    timeStyle: 'short',
                  }),
                  start: format.dateTime(new Date(meeting.scheduledStartAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                }),
              },
              {
                label: t('start.expectedAttendees'),
                value: t('live.attendeeValue', { count: meeting.expectedAttendeeCount }),
              },
            ]}
            size="small"
          />
          <Form layout="vertical">
            <Form.Item
              help={t('start.actualAttendeesHelp')}
              label={t('start.actualAttendees')}
              required
            >
              <InputNumber
                aria-label={t('start.actualAttendees')}
                disabled={busy}
                max={999}
                min={1}
                mode="button"
                onChange={(value) => setAttendeeCount(value ?? 0)}
                precision={0}
                value={attendeeCount}
              />
            </Form.Item>
          </Form>
          <div aria-atomic="true" aria-live="polite" className={styles.noticeRegion}>
            {errorKey ? <Alert content={t(errorKey)} showIcon type="error" /> : null}
          </div>
          <div className={styles.dialogActions}>
            <Button disabled={busy} onClick={onCancel}>
              {t('actions.cancel')}
            </Button>
            <Button
              icon={<IconPlayArrow />}
              loading={busy}
              onClick={() => void submit()}
              type="primary"
            >
              {t('actions.start')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
