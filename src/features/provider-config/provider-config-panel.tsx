'use client';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from '@arco-design/web-react';
import {
  IconCheckCircleFill,
  IconDelete,
  IconExclamationCircleFill,
  IconRefresh,
  IconSafe,
} from '@arco-design/web-react/icon';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  ProviderConfigErrorCode,
  ProviderConfigInput,
  ProviderConfigSummary,
  ProviderId,
  ProviderModelMapping,
} from '@/modules/provider-config';

import { providerConfigClient, type ProviderConfigClient } from './api-client';
import styles from './provider-config.module.css';

const maskedApiKey = '••••••••';

const providerDisplayModels: Record<ProviderId, ProviderModelMapping> = {
  SILICONFLOW: {
    fast: 'deepseek-ai/DeepSeek-V4-Flash',
    grill: 'deepseek-ai/DeepSeek-V4-Flash',
    report: 'deepseek-ai/DeepSeek-V4-Flash',
  },
  STEPFUN: {
    fast: 'step-3.7-flash',
    grill: 'step-3.7-flash',
    report: 'step-3.7-flash',
  },
};

const errorMessageKeys: Record<ProviderConfigErrorCode, string> = {
  INPUT_INVALID: 'errors.INPUT_INVALID',
  ORIGIN_INVALID: 'errors.ORIGIN_INVALID',
  PROVIDER_AUTH_FAILED: 'errors.PROVIDER_AUTH_FAILED',
  PROVIDER_CONFIG_INVALID: 'errors.PROVIDER_CONFIG_INVALID',
  PROVIDER_CONFIG_UNAVAILABLE: 'errors.PROVIDER_CONFIG_UNAVAILABLE',
  PROVIDER_MODEL_NOT_FOUND: 'errors.PROVIDER_MODEL_NOT_FOUND',
  PROVIDER_RATE_LIMITED: 'errors.PROVIDER_RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'errors.PROVIDER_UNAVAILABLE',
  RATE_LIMITED: 'errors.RATE_LIMITED',
};

type Operation = 'delete' | 'save' | 'test' | null;

interface Notice {
  kind: 'error' | 'success';
  message: string;
}

export interface ProviderConfigPanelProps {
  api?: ProviderConfigClient;
  compact?: boolean;
  onConfigured?: (summary: ProviderConfigSummary) => void;
}

function providerLabel(provider: ProviderId, t: ReturnType<typeof useTranslations>) {
  return t(provider === 'STEPFUN' ? 'providers.stepfun.name' : 'providers.siliconflow.name');
}

function ModelMapping({ models }: { models: ProviderModelMapping }) {
  const t = useTranslations('ProviderConfig');

  return (
    <dl className={styles.modelList}>
      {(['fast', 'grill', 'report'] as const).map((role) => (
        <div className={styles.modelRow} key={role}>
          <dt>{t(`models.${role}`)}</dt>
          <dd>{models[role]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProviderConfigPanel({
  api = providerConfigClient,
  compact = false,
  onConfigured,
}: ProviderConfigPanelProps) {
  const t = useTranslations('ProviderConfig');
  const format = useFormatter();
  const [form] = Form.useForm<ProviderConfigInput>();
  const [editing, setEditing] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [operation, setOperation] = useState<Operation>(null);
  const [status, setStatus] = useState<ProviderConfigSummary | null>(null);
  const [testedInput, setTestedInput] = useState<ProviderConfigInput | null>(null);
  const selectedProvider = (Form.useWatch('provider', form) ?? 'STEPFUN') as ProviderId;

  const showForm = status?.configured !== true || editing;
  const busy = operation !== null;

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setNotice(null);
    const result = await api.getStatus();

    if (result.ok) {
      setStatus(result.value);
      setEditing(result.value.configured && result.value.state === 'NEEDS_RECONFIGURATION');
      if (result.value.configured) {
        form.setFieldValue('provider', result.value.provider);
      }
    } else {
      setStatus(null);
      setNotice({ kind: 'error', message: t(errorMessageKeys[result.error.code]) });
    }

    setLoadingStatus(false);
  }, [api, form, t]);

  useEffect(() => {
    let active = true;

    void api.getStatus().then((result) => {
      if (!active) {
        return;
      }

      if (result.ok) {
        setStatus(result.value);
        setEditing(result.value.configured && result.value.state === 'NEEDS_RECONFIGURATION');
        if (result.value.configured) {
          form.setFieldValue('provider', result.value.provider);
        }
      } else {
        setStatus(null);
        setNotice({ kind: 'error', message: t(errorMessageKeys[result.error.code]) });
      }

      setLoadingStatus(false);
    });

    return () => {
      active = false;
    };
  }, [api, form, t]);

  const providerOptions = useMemo(
    () => [
      {
        label: `${t('providers.stepfun.name')} · ${t('providers.stepfun.recommended')}`,
        value: 'STEPFUN',
      },
      { label: t('providers.siliconflow.name'), value: 'SILICONFLOW' },
    ],
    [t],
  );

  function resetTestedInput() {
    setTestedInput(null);
    setNotice(null);
  }

  async function testConnection() {
    let input: ProviderConfigInput;

    try {
      input = await form.validate();
    } catch {
      return;
    }

    const normalizedInput = { ...input, apiKey: input.apiKey.trim() };
    setOperation('test');
    setNotice(null);

    try {
      const result = await api.testConnection(normalizedInput);

      if (result.ok) {
        setTestedInput(normalizedInput);
        setNotice({ kind: 'success', message: t('feedback.testSuccess') });
      } else {
        setTestedInput(null);
        setNotice({ kind: 'error', message: t(errorMessageKeys[result.error.code]) });
      }
    } finally {
      form.setFieldValue('apiKey', '');
      setOperation(null);
    }
  }

  async function saveConfiguration() {
    if (!testedInput) {
      return;
    }

    const input = testedInput;
    setOperation('save');
    setNotice(null);

    try {
      const result = await api.saveConfig(input);

      if (result.ok) {
        const refreshed = await api.getStatus();
        const summary = refreshed.ok ? refreshed.value : result.value;
        setStatus(summary);
        setEditing(false);
        setNotice({ kind: 'success', message: t('feedback.saveSuccess') });
        onConfigured?.(summary);
      } else {
        setNotice({ kind: 'error', message: t(errorMessageKeys[result.error.code]) });
      }
    } finally {
      form.setFieldValue('apiKey', '');
      setTestedInput(null);
      setOperation(null);
    }
  }

  async function deleteConfiguration() {
    setOperation('delete');
    setNotice(null);

    try {
      const result = await api.deleteConfig();

      if (result.ok) {
        setStatus(result.value);
        setEditing(true);
        setTestedInput(null);
        form.resetFields();
        setNotice({ kind: 'success', message: t('feedback.deleteSuccess') });
      } else {
        setNotice({ kind: 'error', message: t(errorMessageKeys[result.error.code]) });
      }
    } finally {
      setOperation(null);
    }
  }

  if (loadingStatus) {
    return (
      <div aria-busy="true" aria-label={t('status.loading')} className={styles.loadingState}>
        <Spin dot />
        <span>{t('status.loading')}</span>
      </div>
    );
  }

  if (status === null) {
    return (
      <div className={styles.statusFailure}>
        {notice ? <Alert content={notice.message} type="error" /> : null}
        <Button icon={<IconRefresh />} onClick={() => void loadStatus()}>
          {t('actions.retryStatus')}
        </Button>
      </div>
    );
  }

  return (
    <div className={compact ? styles.panelCompact : styles.panel}>
      <div aria-atomic="true" aria-live="polite" className={styles.noticeRegion}>
        {notice ? (
          <Alert
            content={notice.message}
            showIcon
            type={notice.kind === 'success' ? 'success' : 'error'}
          />
        ) : null}
      </div>

      {status.configured ? (
        <Card className={styles.statusCard} bordered={false}>
          <div className={styles.statusHeader}>
            <div>
              <Space align="center" size="small">
                {status.state === 'AVAILABLE' ? (
                  <IconCheckCircleFill className={styles.successIcon} />
                ) : (
                  <IconExclamationCircleFill className={styles.warningIcon} />
                )}
                <Typography.Title heading={5} className={styles.statusTitle}>
                  {t(
                    status.state === 'AVAILABLE'
                      ? 'status.available'
                      : 'status.needsReconfiguration',
                  )}
                </Typography.Title>
              </Space>
              <Typography.Text className={styles.statusCaption}>
                {t('status.providerReady', { provider: providerLabel(status.provider, t) })}
              </Typography.Text>
            </div>
            <Tag color={status.state === 'AVAILABLE' ? 'green' : 'orange'}>
              {status.state === 'AVAILABLE' ? t('status.connected') : t('status.actionRequired')}
            </Tag>
          </div>

          <Descriptions
            border
            className={styles.descriptions}
            column={1}
            data={[
              { label: t('fields.provider'), value: providerLabel(status.provider, t) },
              { label: t('fields.apiKey'), value: maskedApiKey },
              {
                label: t('status.lastUsed'),
                value: format.dateTime(new Date(status.lastUsedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              },
            ]}
            size="small"
          />
          <div className={styles.currentModels}>
            <Typography.Text bold>{t('models.title')}</Typography.Text>
            <ModelMapping models={status.models} />
          </div>

          <Space className={styles.statusActions} wrap>
            <Button
              icon={<IconRefresh />}
              onClick={() => {
                form.setFieldValue('provider', status.provider);
                setEditing(true);
                setNotice(null);
              }}
            >
              {t('actions.reconfigure')}
            </Button>
            <Popconfirm
              autoFocus
              cancelText={t('actions.cancel')}
              content={t('delete.content')}
              focusLock
              okButtonProps={{ loading: operation === 'delete', status: 'danger' }}
              okText={t('actions.confirmDelete')}
              onOk={deleteConfiguration}
              title={t('delete.title')}
            >
              <Button icon={<IconDelete />} status="danger" type="outline">
                {t('actions.delete')}
              </Button>
            </Popconfirm>
          </Space>
        </Card>
      ) : null}

      {showForm ? (
        <Card className={styles.formCard} bordered={!compact}>
          <div className={styles.formHeading}>
            <span className={styles.safeIcon}>
              <IconSafe />
            </span>
            <div>
              <Typography.Title heading={5} className={styles.formTitle}>
                {status.configured ? t('form.reconfigureTitle') : t('form.title')}
              </Typography.Title>
              <Typography.Paragraph className={styles.formDescription}>
                {t('form.description')}
              </Typography.Paragraph>
            </div>
          </div>

          <Form<ProviderConfigInput>
            form={form}
            initialValues={{ apiKey: '', provider: 'STEPFUN' }}
            layout="vertical"
          >
            <Form.Item field="provider" label={t('fields.provider')} required>
              <Select
                aria-label={t('fields.provider')}
                disabled={busy}
                id="provider_input"
                onChange={() => resetTestedInput()}
                options={providerOptions}
              />
            </Form.Item>

            <div className={styles.presetBox}>
              <div className={styles.presetHeading}>
                <Typography.Text bold>{t('models.presetTitle')}</Typography.Text>
                <Tag>{t('models.fixed')}</Tag>
              </div>
              <ModelMapping models={providerDisplayModels[selectedProvider]} />
            </div>

            <Form.Item
              field="apiKey"
              label={t('fields.apiKey')}
              required
              rules={[
                { message: t('validation.keyRequired'), required: true },
                { maxLength: 512, message: t('validation.keyTooLong') },
                { match: /^\S+$/u, message: t('validation.keyWhitespace') },
              ]}
            >
              <Input.Password
                aria-label={t('fields.apiKey')}
                aria-describedby="provider-key-help"
                autoComplete="off"
                disabled={busy}
                id="apiKey_input"
                onChange={() => resetTestedInput()}
                placeholder={t('fields.apiKeyPlaceholder')}
                spellCheck={false}
              />
            </Form.Item>
            <Typography.Paragraph className={styles.keyHelp} id="provider-key-help">
              {t('form.keyHelp')}
            </Typography.Paragraph>

            <Space className={styles.formActions} wrap>
              <Button
                disabled={busy}
                loading={operation === 'test'}
                onClick={() => void testConnection()}
              >
                {t('actions.test')}
              </Button>
              <Button
                disabled={!testedInput || busy}
                loading={operation === 'save'}
                onClick={() => void saveConfiguration()}
                type="primary"
              >
                {t('actions.save')}
              </Button>
              {status.configured && editing ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setTestedInput(null);
                    setNotice(null);
                    form.resetFields();
                  }}
                >
                  {t('actions.cancel')}
                </Button>
              ) : null}
            </Space>
          </Form>
        </Card>
      ) : null}
    </div>
  );
}
