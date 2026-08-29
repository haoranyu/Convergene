'use client';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react';
import {
  IconArrowLeft,
  IconCheck,
  IconExperiment,
  IconRefresh,
  IconSend,
} from '@arco-design/web-react/icon';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { AppHeader } from '@/features/app-shell';
import { ProviderConfigGate } from '@/features/provider-config';
import { Link, useRouter } from '@/i18n/navigation';
import {
  isSupportedLocale,
  supportedLocales,
  type MeetingMode,
  type SupportedLocale,
} from '@/modules/meeting-domain';
import type { ClassifyMeetingOutput, MeetingAIErrorCode } from '@/modules/meeting-ai';
import { getBrowserMeetingDatabase, MeetingRepository } from '@/modules/meeting-db/client';

import { classifyMeetingClient } from './classify-client';
import styles from './meeting-creation.module.css';
import { buildLocalMeetingDraft } from './local-meeting';

const primaryModes = ['DECISION', 'BRAINSTORM', 'RETRO'] as const;

interface CreationFormValues {
  contentLocale: SupportedLocale;
  expectedAttendeeCount: number;
  rawRequest: string;
  scheduledRange: string[];
  title?: string;
}

function defaultSchedule(): string[] {
  const start = new Date();
  start.setMinutes(start.getMinutes() + (30 - (start.getMinutes() % 30)), 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1_000);
  const localValue = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16).replace('T', ' ');
  };
  return [localValue(start), localValue(end)];
}

function toIsoSchedule(range: readonly string[]): [string, string] | null {
  const [startValue, endValue] = range;
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return null;
  }
  return [start.toISOString(), end.toISOString()];
}

function aiErrorKey(code: MeetingAIErrorCode): string {
  return `errors.ai.${code}`;
}

interface RecommendationViewProps {
  manual: boolean;
  onBack: () => void;
  onConfirm: () => Promise<void>;
  recommendation: ClassifyMeetingOutput | null;
  saving: boolean;
  selectedMode: MeetingMode | null;
  setSelectedMode: (mode: MeetingMode) => void;
}

function RecommendationView({
  manual,
  onBack,
  onConfirm,
  recommendation,
  saving,
  selectedMode,
  setSelectedMode,
}: RecommendationViewProps) {
  const t = useTranslations('meetingCreation');
  const suggestedTitle = recommendation?.suggestedTitle;

  return (
    <section className={styles.recommendationSection}>
      <Button icon={<IconArrowLeft />} onClick={onBack} type="text">
        {t('actions.editRequest')}
      </Button>

      <div className={styles.recommendationHeading}>
        <Typography.Text className={styles.eyebrow}>
          {manual ? t('recommendation.manualEyebrow') : t('recommendation.aiEyebrow')}
        </Typography.Text>
        <Typography.Title heading={2}>
          {manual
            ? t('recommendation.manualTitle')
            : t('recommendation.title', {
                mode: t(`modes.${recommendation?.recommendedMode.toLowerCase()}.title`),
              })}
        </Typography.Title>
        {suggestedTitle ? (
          <Typography.Paragraph className={styles.suggestedTitle}>
            {t('recommendation.suggestedTitle', { title: suggestedTitle })}
          </Typography.Paragraph>
        ) : null}
        {recommendation ? (
          <Alert
            content={recommendation.reason}
            showIcon
            title={t('recommendation.reasonLabel')}
            type="info"
          />
        ) : (
          <Typography.Paragraph>{t('recommendation.manualDescription')}</Typography.Paragraph>
        )}
      </div>

      <fieldset className={styles.modeFieldset}>
        <legend>{t('recommendation.chooseMode')}</legend>
        <div className={styles.modeGrid}>
          {primaryModes.map((mode) => (
            <button
              aria-pressed={selectedMode === mode}
              className={`${styles.modeCard} ${selectedMode === mode ? styles.modeSelected : ''}`}
              key={mode}
              onClick={() => setSelectedMode(mode)}
              type="button"
            >
              <span className={styles.modeCheck} aria-hidden="true">
                {selectedMode === mode ? <IconCheck /> : null}
              </span>
              <strong>{t(`modes.${mode.toLowerCase()}.title`)}</strong>
              <span>{t(`modes.${mode.toLowerCase()}.description`)}</span>
            </button>
          ))}
        </div>
        <button
          aria-pressed={selectedMode === 'GENERAL'}
          className={`${styles.generalMode} ${selectedMode === 'GENERAL' ? styles.generalSelected : ''}`}
          onClick={() => setSelectedMode('GENERAL')}
          type="button"
        >
          <span>
            <strong>{t('modes.general.title')}</strong>
            <span>{t('modes.general.description')}</span>
          </span>
          {selectedMode === 'GENERAL' ? <IconCheck aria-hidden="true" /> : null}
        </button>
      </fieldset>

      <div className={styles.confirmBar}>
        {recommendation ? (
          <Tag>{t(`confidence.${recommendation.confidence.toLowerCase()}`)}</Tag>
        ) : (
          <span />
        )}
        <Button
          disabled={selectedMode === null}
          icon={<IconSend aria-hidden="true" />}
          loading={saving}
          onClick={() => void onConfirm()}
          size="large"
          type="primary"
        >
          {t('actions.confirm')}
        </Button>
      </div>
    </section>
  );
}

export function MeetingCreation() {
  const localeValue = useLocale();
  const locale = isSupportedLocale(localeValue) ? localeValue : 'zh-CN';
  const router = useRouter();
  const t = useTranslations('meetingCreation');
  const [form] = Form.useForm<CreationFormValues>();
  const classificationOperation = useRef(0);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [draftValues, setDraftValues] = useState<CreationFormValues | null>(null);
  const [formInvalid, setFormInvalid] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualFallbackAvailable, setManualFallbackAvailable] = useState(false);
  const [notice, setNotice] = useState<MeetingAIErrorCode | 'SAVE_FAILED' | null>(null);
  const [recommendation, setRecommendation] = useState<ClassifyMeetingOutput | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMode, setSelectedMode] = useState<MeetingMode | null>(null);
  const [showRecommendation, setShowRecommendation] = useState(false);

  useEffect(
    () => () => {
      classificationOperation.current += 1;
      requestController.current?.abort();
    },
    [],
  );

  function invalidateClassification(): number {
    classificationOperation.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    setClassifying(false);
    return classificationOperation.current;
  }

  async function validatedValues(): Promise<CreationFormValues | null> {
    try {
      const values = await form.validate();
      if (!toIsoSchedule(values.scheduledRange)) {
        form.setFieldValue('scheduledRange', values.scheduledRange);
        setFormInvalid(true);
        requestAnimationFrame(() => errorSummaryRef.current?.focus());
        return null;
      }
      setFormInvalid(false);
      return values;
    } catch {
      setFormInvalid(true);
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return null;
    }
  }

  async function classify(handleAIError: (error: unknown) => boolean) {
    const operation = invalidateClassification();
    const values = await validatedValues();
    if (!values || classificationOperation.current !== operation) return;

    const controller = new AbortController();
    requestController.current = controller;
    setClassifying(true);
    setNotice(null);
    try {
      const result = await classifyMeetingClient.classify(
        {
          rawRequest: values.rawRequest.trim(),
          ...(values.title?.trim() ? { userTitle: values.title.trim() } : {}),
        },
        values.contentLocale,
        controller.signal,
      );
      if (
        classificationOperation.current !== operation ||
        requestController.current !== controller
      ) {
        return;
      }
      if (!result.ok) {
        setNotice(result.error.code);
        setManualFallbackAvailable(true);
        handleAIError(result);
        return;
      }
      setDraftValues(values);
      setRecommendation(result.value);
      setSelectedMode(result.value.recommendedMode);
      setManual(false);
      setManualFallbackAvailable(false);
      setShowRecommendation(true);
    } finally {
      if (
        classificationOperation.current === operation &&
        requestController.current === controller
      ) {
        requestController.current = null;
        setClassifying(false);
      }
    }
  }

  async function chooseManually() {
    const operation = invalidateClassification();
    const values = await validatedValues();
    if (!values || classificationOperation.current !== operation) return;
    setNotice(null);
    setDraftValues(values);
    setRecommendation(null);
    setSelectedMode(null);
    setManual(true);
    setShowRecommendation(true);
  }

  async function confirmMeeting() {
    if (!selectedMode || !draftValues) {
      setShowRecommendation(false);
      return;
    }
    const schedule = toIsoSchedule(draftValues.scheduledRange);
    if (!schedule) return;

    setSaving(true);
    setNotice(null);
    try {
      const now = new Date();
      const draft = buildLocalMeetingDraft(
        {
          contentLocale: draftValues.contentLocale,
          expectedAttendeeCount: draftValues.expectedAttendeeCount,
          rawRequest: draftValues.rawRequest,
          scheduledEndAt: schedule[1],
          scheduledStartAt: schedule[0],
          title: draftValues.title?.trim() || recommendation?.suggestedTitle || t('fallbackTitle'),
        },
        now,
      );
      const saved = await new MeetingRepository(
        getBrowserMeetingDatabase(),
      ).createMeetingForPreparation(
        draft,
        selectedMode,
        recommendation?.recommendedMode === selectedMode ? recommendation.reason : undefined,
        now,
      );
      if (!saved.ok) {
        setNotice('SAVE_FAILED');
        return;
      }
      router.push(`/meetings/${saved.value.id}/prepare`);
    } catch {
      setNotice('SAVE_FAILED');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AppHeader title={t('pageTitle')} />
      <main className={styles.shell}>
        <div className={styles.intro}>
          <Link className={styles.backLink} href="/">
            <IconArrowLeft aria-hidden="true" />
            {t('actions.back')}
          </Link>
          <Typography.Text className={styles.eyebrow}>{t('eyebrow')}</Typography.Text>
          <Typography.Title heading={1}>{t('title')}</Typography.Title>
          <Typography.Paragraph>{t('description')}</Typography.Paragraph>
        </div>

        <Card className={styles.formCard} bordered>
          {showRecommendation ? (
            <RecommendationView
              manual={manual}
              onBack={() => setShowRecommendation(false)}
              onConfirm={confirmMeeting}
              recommendation={recommendation}
              saving={saving}
              selectedMode={selectedMode}
              setSelectedMode={setSelectedMode}
            />
          ) : (
            <ProviderConfigGate>
              {({ handleAIError }) => (
                <Form<CreationFormValues>
                  form={form}
                  initialValues={
                    draftValues ?? {
                      contentLocale: locale,
                      expectedAttendeeCount: 5,
                      scheduledRange: defaultSchedule(),
                    }
                  }
                  layout="vertical"
                  requiredSymbol={{ position: 'end' }}
                >
                  <div className={styles.errorSummary} ref={errorSummaryRef} tabIndex={-1}>
                    {formInvalid ? (
                      <Alert content={t('errors.form')} showIcon type="error" />
                    ) : null}
                  </div>

                  <Form.Item
                    field="rawRequest"
                    label={t('fields.rawRequest.label')}
                    rules={[
                      { required: true, message: t('fields.rawRequest.required') },
                      { maxLength: 4_000, message: t('fields.rawRequest.tooLong') },
                    ]}
                  >
                    <Input.TextArea
                      autoSize={{ maxRows: 9, minRows: 6 }}
                      maxLength={4_000}
                      placeholder={t('fields.rawRequest.placeholder')}
                      showWordLimit
                    />
                  </Form.Item>
                  <Typography.Paragraph className={styles.fieldHelp}>
                    {t('fields.rawRequest.help')}
                  </Typography.Paragraph>

                  <div className={styles.formGrid}>
                    <Form.Item
                      field="scheduledRange"
                      label={t('fields.schedule.label')}
                      rules={[{ required: true, message: t('fields.schedule.required') }]}
                    >
                      <DatePicker.RangePicker
                        fixedTime
                        format="YYYY-MM-DD HH:mm"
                        inputProps={[
                          { 'aria-label': t('fields.schedule.start') },
                          { 'aria-label': t('fields.schedule.end') },
                        ]}
                        placeholder={[t('fields.schedule.start'), t('fields.schedule.end')]}
                        showTime
                      />
                    </Form.Item>
                    <Form.Item
                      field="expectedAttendeeCount"
                      label={t('fields.attendees.label')}
                      rules={[
                        { required: true, message: t('fields.attendees.required') },
                        {
                          validator(value, callback) {
                            if (Number.isInteger(value) && value > 0 && value <= 10_000) callback();
                            else callback(t('fields.attendees.invalid'));
                          },
                        },
                      ]}
                    >
                      <InputNumber max={10_000} min={1} mode="button" precision={0} />
                    </Form.Item>
                    <Form.Item
                      field="contentLocale"
                      label={t('fields.locale.label')}
                      rules={[{ required: true, message: t('fields.locale.required') }]}
                    >
                      <Select
                        options={supportedLocales.map((value) => ({
                          label: t(`locales.${value}`),
                          value,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item field="title" label={t('fields.title.label')}>
                      <Input
                        maxLength={160}
                        placeholder={t('fields.title.placeholder')}
                        showWordLimit
                      />
                    </Form.Item>
                  </div>

                  <div aria-atomic="true" aria-live="polite" className={styles.noticeRegion}>
                    {notice ? (
                      <Alert
                        content={
                          notice === 'SAVE_FAILED' ? t('errors.save') : t(aiErrorKey(notice))
                        }
                        showIcon
                        type="error"
                      />
                    ) : null}
                  </div>

                  <div className={styles.formActions}>
                    {manualFallbackAvailable ? (
                      <Button onClick={() => void chooseManually()} type="text">
                        {t('actions.manual')}
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Space wrap>
                      {notice && notice !== 'SAVE_FAILED' ? (
                        <Button
                          icon={<IconRefresh aria-hidden="true" />}
                          loading={classifying}
                          onClick={() => void classify(handleAIError)}
                        >
                          {t('actions.retry')}
                        </Button>
                      ) : null}
                      <Button
                        icon={<IconExperiment aria-hidden="true" />}
                        loading={classifying}
                        onClick={() => void classify(handleAIError)}
                        size="large"
                        type="primary"
                      >
                        {t('actions.classify')}
                      </Button>
                    </Space>
                  </div>
                </Form>
              )}
            </ProviderConfigGate>
          )}

          {notice === 'SAVE_FAILED' && showRecommendation ? (
            <Alert content={t('errors.save')} showIcon type="error" />
          ) : null}
        </Card>
      </main>
    </>
  );
}
