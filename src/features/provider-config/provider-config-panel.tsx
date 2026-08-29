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

import {
  providerModelPresets,
  providerIds,
  type ProviderConfigErrorCode,
  type ProviderConfigInput,
  type ProviderConfigSummary,
  type ProviderId,
  type ProviderModelMapping,
} from '@/modules/provider-config';

import { providerConfigClient, type ProviderConfigClient } from './api-client';
import styles from './provider-config.module.css';

const maskedApiKey = '••••••••';

const errorMessageKeys: Record<ProviderConfigErrorCode, string> = {
  INPUT_INVALID: 'errors.INPUT_INVALID',
  ORIGIN_INVALID: 'errors.ORIGIN_INVALID',
  PROVIDER_ACCESS_RESTRICTED: 'errors.PROVIDER_ACCESS_RESTRICTED',
  PROVIDER_AUTH_FAILED: 'errors.PROVIDER_AUTH_FAILED',
  PROVIDER_CONFIG_INVALID: 'errors.PROVIDER_CONFIG_INVALID',
  PROVIDER_CONFIG_UNAVAILABLE: 'errors.PROVIDER_CONFIG_UNAVAILABLE',
  PROVIDER_MODEL_NOT_FOUND: 'errors.PROVIDER_MODEL_NOT_FOUND',
  PROVIDER_RATE_LIMITED: 'errors.PROVIDER_RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'errors.PROVIDER_UNAVAILABLE',
  RATE_LIMITED: 'errors.RATE_LIMITED',
};

type Operation = 'delete' | 'save' | 'select' | 'test' | null;

interface Notice {
  kind: 'error' | 'success';
  message: string;
}

export interface ProviderConfigPanelProps {
  api?: ProviderConfigClient;
  compact?: boolean;
  onConfigured?: (summary: ProviderConfigSummary) => void;
  reconfigurationErrorCode?: 'PROVIDER_AUTH_FAILED' | 'PROVIDER_CONFIG_INVALID';
}

function providerLabel(provider: ProviderId, t: ReturnType<typeof useTranslations>) {
  return t(provider === 'STEPFUN' ? 'providers.stepfun.name' : 'providers.siliconflow.name');
}

function ModelMapping({ models }: { models: ProviderModelMapping }) {
  const t = useTranslations('providerConfig');

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
  reconfigurationErrorCode,
}: ProviderConfigPanelProps) {
  const t = useTranslations('providerConfig');
  const format = useFormatter();
  const [form] = Form.useForm<ProviderConfigInput>();
  const [editing, setEditing] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderId>('STEPFUN');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [operation, setOperation] = useState<Operation>(null);
  const [status, setStatus] = useState<ProviderConfigSummary | null>(null);
  const [testedInput, setTestedInput] = useState<ProviderConfigInput | null>(null);
  const [selectingProvider, setSelectingProvider] = useState<ProviderId | null>(null);
  const selectedProvider = (Form.useWatch('provider', form) ?? editingProvider) as ProviderId;

  const showForm = status?.configured !== true || editing;
  const busy = operation !== null;

  const applyStatusResult = useCallback(
    (result: Awaited<ReturnType<ProviderConfigClient['getStatus']>>) => {
      if (result.ok) {
        setStatus(result.value);
        const activeCredential = result.value.configured
          ? result.value.providers[result.value.activeProvider]
          : null;
        setEditing(
          result.value.configured &&
            (activeCredential?.state === 'NEEDS_RECONFIGURATION' ||
              Boolean(reconfigurationErrorCode)),
        );
        if (reconfigurationErrorCode) {
          setNotice({
            kind: 'error',
            message: t(errorMessageKeys[reconfigurationErrorCode]),
          });
        }
        if (result.value.configured) {
          setEditingProvider(result.value.activeProvider);
          form.setFieldValue('provider', result.value.activeProvider);
        }
        return;
      }

      setStatus(
        result.error.code === 'PROVIDER_CONFIG_INVALID'
          ? { configured: false, state: 'NOT_CONFIGURED' }
          : null,
      );
      setNotice({ kind: 'error', message: t(errorMessageKeys[result.error.code]) });
    },
    [form, reconfigurationErrorCode, t],
  );

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setNotice(null);
    const result = await api.getStatus();
    applyStatusResult(result);
    setLoadingStatus(false);
  }, [api, applyStatusResult]);

  useEffect(() => {
    let active = true;

    void api.getStatus().then((result) => {
      if (!active) {
        return;
      }

      applyStatusResult(result);
      setLoadingStatus(false);
    });

    return () => {
      active = false;
    };
  }, [api, applyStatusResult]);

  useEffect(() => {
    if (showForm) {
      form.setFieldValue('provider', editingProvider);
    }
  }, [editingProvider, form, showForm]);

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
        setEditingProvider('STEPFUN');
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

  async function selectProvider(provider: ProviderId) {
    setOperation('select');
    setSelectingProvider(provider);
    setNotice(null);

    try {
      const result = await api.selectProvider(provider);
      if (result.ok) {
        setStatus(result.value);
        setEditing(false);
        setNotice({ kind: 'success', message: t('feedback.selectSuccess') });
        onConfigured?.(result.value);
      } else {
        setNotice({ kind: 'error', message: t(errorMessageKeys[result.error.code]) });
      }
    } finally {
      setSelectingProvider(null);
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
        <div className={styles.statusList}>
          {providerIds.map((provider) => {
            const credential = status.providers[provider];
            if (!credential) return null;
            const active = provider === status.activeProvider;
            const available = credential.state === 'AVAILABLE';

            return (
              <Card className={styles.statusCard} bordered={false} key={provider}>
                <div className={styles.statusHeader}>
                  <div>
                    <Space align="center" size="small">
                      {available ? (
                        <IconCheckCircleFill className={styles.successIcon} />
                      ) : (
                        <IconExclamationCircleFill className={styles.warningIcon} />
                      )}
                      <Typography.Title heading={5} className={styles.statusTitle}>
                        {providerLabel(provider, t)}
                      </Typography.Title>
                    </Space>
                    <Typography.Text className={styles.statusCaption}>
                      {t(active ? 'status.providerReady' : 'status.providerStored', {
                        provider: providerLabel(provider, t),
                      })}
                    </Typography.Text>
                  </div>
                  <Tag color={available ? (active ? 'blue' : 'green') : 'orange'}>
                    {available
                      ? t(active ? 'status.active' : 'status.connected')
                      : t('status.actionRequired')}
                  </Tag>
                </div>

                <Descriptions
                  border
                  className={styles.descriptions}
                  column={1}
                  data={[
                    { label: t('fields.provider'), value: providerLabel(provider, t) },
                    { label: t('fields.apiKey'), value: maskedApiKey },
                    {
                      label: t('status.lastUsed'),
                      value: format.dateTime(new Date(credential.lastUsedAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    },
                  ]}
                  size="small"
                />
                <div className={styles.currentModels}>
                  <Typography.Text bold>{t('models.title')}</Typography.Text>
                  <ModelMapping models={credential.models} />
                </div>

                <Space className={styles.statusActions} wrap>
                  {!active && available ? (
                    <Button
                      disabled={busy}
                      loading={operation === 'select' && selectingProvider === provider}
                      onClick={() => void selectProvider(provider)}
                      type="primary"
                    >
                      {t('actions.select', { provider: providerLabel(provider, t) })}
                    </Button>
                  ) : null}
                  <Button
                    icon={<IconRefresh />}
                    onClick={() => {
                      setEditingProvider(provider);
                      setEditing(true);
                      setNotice(null);
                    }}
                  >
                    {t('actions.reconfigure')}
                  </Button>
                </Space>
              </Card>
            );
          })}
          <Space className={styles.statusActions} wrap>
            {providerIds.some((provider) => status.providers[provider] === null) ? (
              <Button
                onClick={() => {
                  const missingProvider = providerIds.find(
                    (provider) => status.providers[provider] === null,
                  );
                  if (missingProvider) setEditingProvider(missingProvider);
                  setEditing(true);
                  setNotice(null);
                }}
              >
                {t('actions.addProvider')}
              </Button>
            ) : null}
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
        </div>
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
            autoComplete="off"
            form={form}
            initialValues={{ apiKey: '', provider: 'STEPFUN' }}
            layout="vertical"
          >
            <Form.Item field="provider" label={t('fields.provider')} required>
              <Select
                aria-label={t('fields.provider')}
                disabled={busy}
                id="provider_input"
                onChange={(provider) => {
                  setEditingProvider(provider);
                  resetTestedInput();
                }}
                options={providerOptions}
              />
            </Form.Item>

            <div className={styles.presetBox}>
              <div className={styles.presetHeading}>
                <Typography.Text bold>{t('models.presetTitle')}</Typography.Text>
                <Tag>{t('models.fixed')}</Tag>
              </div>
              <ModelMapping models={providerModelPresets[selectedProvider]} />
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
                data-1p-ignore="true"
                data-bwignore="true"
                data-lpignore="true"
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
