'use client';

import {
  Alert,
  Button,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { IconCheckCircle, IconDelete, IconEdit, IconPlusCircle } from '@arco-design/web-react/icon';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  defaultOutcomeKind,
  outcomeKinds,
  type MarkOutcomeInput,
  type Meeting,
  type MeetingOutcome,
  type OutcomeKind,
} from '@/modules/meeting-domain';

import type { MarkOutcomeCommand, UnmarkOutcomeCommand, UpdateOutcomeCommand } from './contracts';
import { meetingCommandErrorKey } from './contracts';
import styles from './live-meeting.module.css';

interface OutcomeFormValues {
  dueDate?: string;
  kind: OutcomeKind;
  owner?: string;
}

export interface SelectedOutcomeNode {
  id: string;
  title: string;
}

export interface OutcomePanelProps {
  createOutcomeId?: () => string;
  existingOutcome?: MeetingOutcome;
  meeting: Meeting;
  node: SelectedOutcomeNode;
  onMark: MarkOutcomeCommand;
  onUnmark: UnmarkOutcomeCommand;
  onUpdate: UpdateOutcomeCommand;
}

export function OutcomePanel({ ...props }: OutcomePanelProps) {
  return (
    <OutcomePanelState
      key={[
        props.node.id,
        props.existingOutcome?.id ?? 'unmarked',
        props.existingOutcome?.kind,
        props.existingOutcome?.owner,
        props.existingOutcome?.dueDate,
      ].join(':')}
      {...props}
    />
  );
}

function OutcomePanelState({
  createOutcomeId = () => crypto.randomUUID(),
  existingOutcome,
  meeting,
  node,
  onMark,
  onUnmark,
  onUpdate,
}: OutcomePanelProps) {
  const t = useTranslations('outcome');
  const meetingT = useTranslations('meeting');
  const [form] = Form.useForm<OutcomeFormValues>();
  const [busy, setBusy] = useState<'mark' | 'unmark' | 'update' | null>(null);
  const [editing, setEditing] = useState(existingOutcome === undefined);
  const [notice, setNotice] = useState<{ key: string; type: 'error' | 'success' } | null>(null);
  const selectedKind = (Form.useWatch('kind', form) ??
    defaultOutcomeKind(meeting.mode ?? 'GENERAL')) as OutcomeKind;

  const kindOptions = useMemo(
    () => outcomeKinds.map((kind) => ({ label: t(`kinds.${kind}`), value: kind })),
    [t],
  );

  async function mark() {
    let values: OutcomeFormValues;
    try {
      values = await form.validate();
    } catch {
      return;
    }

    const input: MarkOutcomeInput = {
      dueDate: values.kind === 'ACTION' ? values.dueDate?.trim() || undefined : undefined,
      id: createOutcomeId(),
      kind: values.kind,
      nodeId: node.id,
      owner: values.kind === 'ACTION' ? values.owner?.trim() || undefined : undefined,
    };
    setBusy('mark');
    setNotice(null);
    try {
      const result = await onMark(input);
      setNotice(
        result.ok
          ? { key: 'feedback.marked', type: 'success' }
          : { key: meetingCommandErrorKey(result.error.code), type: 'error' },
      );
      if (result.ok) setEditing(false);
    } finally {
      setBusy(null);
    }
  }

  async function update() {
    if (existingOutcome?.kind !== 'ACTION') {
      setEditing(false);
      return;
    }
    let values: OutcomeFormValues;
    try {
      values = await form.validate();
    } catch {
      return;
    }

    setBusy('update');
    setNotice(null);
    try {
      const result = await onUpdate(existingOutcome.id, {
        dueDate: values.dueDate?.trim() || undefined,
        owner: values.owner?.trim() || undefined,
      });
      setNotice(
        result.ok
          ? { key: 'feedback.updated', type: 'success' }
          : { key: meetingCommandErrorKey(result.error.code), type: 'error' },
      );
      if (result.ok) setEditing(false);
    } finally {
      setBusy(null);
    }
  }

  async function unmark() {
    if (existingOutcome === undefined) return;
    setBusy('unmark');
    setNotice(null);
    try {
      const result = await onUnmark(existingOutcome.id);
      setNotice(
        result.ok
          ? { key: 'feedback.unmarked', type: 'success' }
          : { key: meetingCommandErrorKey(result.error.code), type: 'error' },
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby={`outcome-panel-${node.id}`} className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <Typography.Title
            className={styles.panelTitle}
            heading={5}
            id={`outcome-panel-${node.id}`}
          >
            {t('title')}
          </Typography.Title>
          <Typography.Text className={styles.mutedText}>{node.title}</Typography.Text>
        </div>
        {existingOutcome ? (
          <Tag color="arcoblue" icon={<IconCheckCircle />}>
            {t(`kinds.${existingOutcome.kind}`)}
          </Tag>
        ) : null}
      </div>

      <div aria-atomic="true" aria-live="polite" className={styles.noticeRegion}>
        {notice ? (
          <Alert
            content={notice.type === 'error' ? meetingT(notice.key) : t(notice.key)}
            showIcon
            type={notice.type}
          />
        ) : null}
      </div>

      {existingOutcome && !editing ? (
        <>
          {existingOutcome.kind === 'ACTION' ? (
            <Space size="large" wrap>
              <Typography.Text>
                {t('fields.owner')}: {existingOutcome.owner?.trim() || t('values.notSet')}
              </Typography.Text>
              <Typography.Text>
                {t('fields.dueDate')}: {existingOutcome.dueDate?.trim() || t('values.notSet')}
              </Typography.Text>
            </Space>
          ) : (
            <Typography.Paragraph className={styles.helperText}>
              {t('savedDescription')}
            </Typography.Paragraph>
          )}
          <div className={styles.panelActions}>
            {existingOutcome.kind === 'ACTION' ? (
              <Button icon={<IconEdit />} onClick={() => setEditing(true)}>
                {t('actions.editMetadata')}
              </Button>
            ) : null}
            <Popconfirm
              autoFocus
              cancelText={t('actions.cancel')}
              content={t('unmark.content')}
              focusLock
              okButtonProps={{ loading: busy === 'unmark', status: 'danger' }}
              okText={t('actions.confirmUnmark')}
              onOk={unmark}
              title={t('unmark.title')}
            >
              <Button icon={<IconDelete />} status="danger" type="outline">
                {t('actions.unmark')}
              </Button>
            </Popconfirm>
          </div>
        </>
      ) : (
        <Form<OutcomeFormValues>
          form={form}
          initialValues={{
            dueDate: existingOutcome?.dueDate,
            kind: existingOutcome?.kind ?? defaultOutcomeKind(meeting.mode ?? 'GENERAL'),
            owner: existingOutcome?.owner,
          }}
          layout="vertical"
        >
          <div className={styles.metadataGrid}>
            <Form.Item
              className={styles.fullWidthField}
              field="kind"
              label={t('fields.kind')}
              required
            >
              <Select
                aria-label={t('fields.kind')}
                disabled={existingOutcome !== undefined || busy !== null}
                options={kindOptions}
              />
            </Form.Item>
            {selectedKind === 'ACTION' ? (
              <>
                <Form.Item field="owner" label={t('fields.owner')}>
                  <Input
                    aria-label={t('fields.owner')}
                    disabled={busy !== null}
                    maxLength={120}
                    placeholder={t('fields.ownerPlaceholder')}
                  />
                </Form.Item>
                <Form.Item field="dueDate" label={t('fields.dueDate')}>
                  <Input aria-label={t('fields.dueDate')} disabled={busy !== null} type="date" />
                </Form.Item>
              </>
            ) : null}
          </div>
          <Typography.Paragraph className={styles.helperText}>
            {t(selectedKind === 'ACTION' ? 'actionHelp' : 'markHelp')}
          </Typography.Paragraph>
          <div className={styles.panelActions}>
            {existingOutcome ? (
              <Button disabled={busy !== null} onClick={() => setEditing(false)}>
                {t('actions.cancel')}
              </Button>
            ) : null}
            <Button
              icon={existingOutcome ? <IconEdit /> : <IconPlusCircle />}
              loading={busy === 'mark' || busy === 'update'}
              onClick={() => void (existingOutcome ? update() : mark())}
              type="primary"
            >
              {t(existingOutcome ? 'actions.saveMetadata' : 'actions.mark')}
            </Button>
          </div>
        </Form>
      )}
    </section>
  );
}
