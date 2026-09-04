'use client';

import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Radio,
  Spin,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppHeader } from '@/features/app-shell';
import { MeetingModeSelector } from '@/features/meeting-mode-selector';
import { Link } from '@/i18n/navigation';
import {
  MeetingDatabase,
  MeetingRepository,
  observeMeetingAggregate,
  type MeetingAggregate,
} from '@/modules/meeting-db';
import {
  confirmMeetingMode,
  type GrillTurn,
  type MeetingBriefDraft,
  type MeetingMode,
  type ReadinessDimension,
} from '@/modules/meeting-domain';
import { ProviderConfigGate, type ProviderConfigGateController } from '@/features/provider-config';

import type { PreparationAIClient } from './ai-contract';
import { preparationAIClient } from './api-client';
import {
  answerCurrentGrillTurn,
  lockBriefAndGenerateMap,
  returnToGrill,
  returnToModeSelection,
  runGrillStep,
} from './orchestrator';
import styles from './preparation-workspace.module.css';

interface PreparationWorkspaceProps {
  aiClient?: PreparationAIClient;
  database?: MeetingDatabase;
  meetingId: string;
}

let browserDatabase: MeetingDatabase | undefined;

function defaultMeetingDatabase(): MeetingDatabase {
  browserDatabase ??= new MeetingDatabase();
  return browserDatabase;
}

type Operation = 'IDLE' | 'SELECT_MODE' | 'GRILL' | 'SAVE_BRIEF' | 'GENERATE_MAP' | 'ROLLBACK';

interface BriefFields {
  assumptions: string;
  confirmed: string;
  desiredOutcome: string;
  objective: string;
  openingLine: string;
  unknowns: string;
}

interface BriefEditor {
  base: MeetingBriefDraft;
  fields: BriefFields;
  meetingId: string;
  revision: string;
}

const briefFieldNames = [
  'objective',
  'desiredOutcome',
  'confirmed',
  'assumptions',
  'unknowns',
  'openingLine',
] as const;

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function briefFields(brief: MeetingBriefDraft): BriefFields {
  return {
    assumptions: brief.assumptions.join('\n'),
    confirmed: brief.confirmed.join('\n'),
    desiredOutcome: brief.desiredOutcome,
    objective: brief.objective,
    openingLine: brief.facilitation.openingLine,
    unknowns: brief.unknowns.join('\n'),
  };
}

function hasBriefEdits(editor: BriefEditor): boolean {
  const saved = briefFields(editor.base);
  return (Object.keys(saved) as (keyof BriefFields)[]).some(
    (field) => editor.fields[field] !== saved[field],
  );
}

function briefEditor(meetingId: string, base: MeetingBriefDraft, revision: string): BriefEditor {
  return { base, fields: briefFields(base), meetingId, revision };
}

function updatedBrief(brief: MeetingBriefDraft, fields: BriefFields): MeetingBriefDraft {
  return {
    ...brief,
    assumptions: lines(fields.assumptions),
    confirmed: lines(fields.confirmed),
    desiredOutcome: fields.desiredOutcome.trim(),
    facilitation: { ...brief.facilitation, openingLine: fields.openingLine.trim() },
    objective: fields.objective.trim(),
    unknowns: lines(fields.unknowns),
  };
}

function PreparationWorkspaceBody({
  aiClient = preparationAIClient,
  controller,
  database: suppliedDatabase,
  meetingId,
}: PreparationWorkspaceProps & { controller: ProviderConfigGateController }) {
  const t = useTranslations('preparation');
  const [database] = useState(() => suppliedDatabase ?? defaultMeetingDatabase());
  const repository = useMemo(() => new MeetingRepository(database), [database]);
  const dependencies = useMemo(() => ({ client: aiClient, repository }), [aiClient, repository]);
  const [aggregate, setAggregate] = useState<MeetingAggregate>();
  const [loaded, setLoaded] = useState(false);
  const [operation, setOperation] = useState<Operation>('IDLE');
  const [errorCode, setErrorCode] = useState<string>();
  const [answer, setAnswer] = useState('');
  const [answerTurnId, setAnswerTurnId] = useState<string>();
  const [textAnswerTurnId, setTextAnswerTurnId] = useState<string>();
  const [requestedDimension, setRequestedDimension] = useState<string>();
  const [selectedMode, setSelectedMode] = useState<MeetingMode>();
  const [editor, setEditor] = useState<BriefEditor>();
  const autoStarted = useRef<string | undefined>(undefined);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const preservedDraftRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const stop = observeMeetingAggregate(
      database,
      meetingId,
      (next) => {
        setAggregate(next);
        setLoaded(true);
      },
      () => {
        setErrorCode('INVALID_STORED_DATA');
        setLoaded(true);
      },
    );
    return () => {
      stop();
    };
  }, [database, meetingId]);

  const meeting = aggregate?.meeting;
  const pendingTurn = aggregate?.grillTurns.find(({ disposition }) => disposition === 'PENDING');
  const pendingTurnId = pendingTurn?.id;
  const pendingQuestionType = pendingTurn?.questionType;
  const fields = editor?.fields;
  const hasUnsavedBrief = editor !== undefined && hasBriefEdits(editor);
  const briefStageChanged =
    hasUnsavedBrief &&
    editor.meetingId === meetingId &&
    (meeting?.preparationStage !== 'BRIEF_READY' || meeting.brief?.confirmedAt !== undefined);

  if (
    meeting?.preparationStage === 'BRIEF_READY' &&
    meeting.brief !== undefined &&
    meeting.brief.confirmedAt === undefined
  ) {
    if (
      editor === undefined ||
      editor.meetingId !== meeting.id ||
      (editor.revision < meeting.updatedAt && !hasBriefEdits(editor))
    ) {
      setEditor(briefEditor(meeting.id, meeting.brief, meeting.updatedAt));
    }
  } else if (editor !== undefined && (!hasUnsavedBrief || editor.meetingId !== meetingId)) {
    setEditor(undefined);
  }

  const perform = useCallback(
    async (nextOperation: Operation, action: () => Promise<void>) => {
      setOperation(nextOperation);
      setErrorCode(undefined);
      try {
        await action();
      } catch (error) {
        if (!controller.handleAIError(error)) {
          setErrorCode(
            typeof error === 'object' && error !== null && 'code' in error
              ? String(error.code)
              : 'UNKNOWN',
          );
        }
      } finally {
        setOperation('IDLE');
      }
    },
    [controller],
  );

  const requestQuestion = useCallback(
    async (current: MeetingAggregate, options: Parameters<typeof runGrillStep>[2] = {}) => {
      await runGrillStep(current, dependencies, options);
      setRequestedDimension(undefined);
    },
    [dependencies],
  );

  useEffect(() => {
    if (
      aggregate?.meeting.preparationStage !== 'GRILLING' ||
      aggregate.grillTurns.length !== 0 ||
      operation !== 'IDLE' ||
      errorCode !== undefined ||
      briefStageChanged
    ) {
      return;
    }
    const key = `${aggregate.meeting.id}:${aggregate.meeting.updatedAt}`;
    if (autoStarted.current === key) return;
    autoStarted.current = key;
    void perform('GRILL', () => requestQuestion(aggregate));
  }, [aggregate, briefStageChanged, errorCode, operation, perform, requestQuestion]);

  useEffect(() => {
    if (errorCode !== undefined) errorRef.current?.focus();
  }, [errorCode]);

  useEffect(() => {
    if (briefStageChanged) preservedDraftRef.current?.focus();
  }, [briefStageChanged]);

  if (!loaded) {
    return (
      <main aria-busy="true" className={styles.centered}>
        <h1 className={styles.srOnly}>{t('metadata.title')}</h1>
        <Spin dot />
        <p>{t('loading')}</p>
      </main>
    );
  }

  if (aggregate === undefined) {
    return (
      <main className={styles.centered}>
        <h1 className={styles.srOnly}>{t('metadata.title')}</h1>
        <Empty description={t('notFound')} />
        <Link className={styles.textLink} href="/">
          {t('actions.back')}
        </Link>
      </main>
    );
  }

  const currentAggregate = aggregate;
  const currentMeeting = currentAggregate.meeting;

  const pending = pendingTurn;
  const latest = pending ?? aggregate.grillTurns.at(-1);
  const readiness = meeting?.brief?.readiness ?? latest?.readiness;
  const busy = operation !== 'IDLE';

  if (briefStageChanged && editor !== undefined) {
    return (
      <main className={styles.shell}>
        <header className={styles.topbar}>
          <strong>{currentMeeting.title}</strong>
          <Tag>{t('localOnly')}</Tag>
        </header>
        <section className={styles.preservedDraft}>
          <h1 ref={preservedDraftRef} tabIndex={-1}>
            {t('brief.preservedTitle')}
          </h1>
          <Alert content={t('brief.stageChanged')} showIcon type="warning" />
          <div className={styles.actionRow}>
            <Button
              onClick={() => {
                if (window.confirm(t('brief.loadSavedConfirm'))) setEditor(undefined);
              }}
              type="primary"
            >
              {t('actions.continueSavedMeeting')}
            </Button>
          </div>
          <div className={styles.briefGrid}>
            {briefFieldNames.map((field) => (
              <label className={styles.briefField} key={field}>
                <strong>{t(`brief.fields.${field}`)}</strong>
                <Input.TextArea readOnly rows={4} value={editor.fields[field]} />
              </label>
            ))}
          </div>
        </section>
      </main>
    );
  }
  const answerMode =
    pendingQuestionType === 'SINGLE_CHOICE' && textAnswerTurnId !== pendingTurnId
      ? 'CHOICE'
      : 'TEXT';
  const currentAnswer = pendingTurnId !== undefined && answerTurnId === pendingTurnId ? answer : '';
  const selectedOptionValue =
    answerMode === 'CHOICE'
      ? pending?.options?.find(({ label }) => label === currentAnswer)?.value
      : undefined;
  const canLoadSavedDraft =
    errorCode === 'STALE_WRITE' &&
    meeting?.preparationStage === 'BRIEF_READY' &&
    meeting.brief?.confirmedAt === undefined;

  const errorAlert = errorCode ? (
    <div ref={errorRef} role="alert" tabIndex={-1}>
      <Alert
        action={
          meeting?.preparationStage === 'GRILLING' && pending === undefined ? (
            <Button
              disabled={busy}
              onClick={() => void perform('GRILL', () => requestQuestion(aggregate))}
              size="small"
            >
              {t('actions.retry')}
            </Button>
          ) : undefined
        }
        content={t.has(`errors.${errorCode}`) ? t(`errors.${errorCode}`) : t('errors.UNKNOWN')}
        title={t('errors.title')}
        type="error"
      />
      {canLoadSavedDraft ? (
        <div className={styles.actionRow}>
          <Button disabled={busy} onClick={loadSavedDraft}>
            {t('actions.loadSavedDraft')}
          </Button>
        </div>
      ) : null}
    </div>
  ) : null;

  if (meeting?.preparationStage === 'DRAFT') {
    return (
      <main aria-busy={busy} className={styles.shell}>
        <h1 className={styles.srOnly}>{t('modeSelection.title')}</h1>
        <header className={styles.topbar}>
          <strong>{meeting.title}</strong>
          <Tag>{t('localOnly')}</Tag>
        </header>
        <section className={styles.centeredPanel}>
          {errorAlert}
          <Typography.Title heading={2}>{t('modeSelection.title')}</Typography.Title>
          <Typography.Paragraph>{t('modeSelection.description')}</Typography.Paragraph>
          <MeetingModeSelector
            disabled={busy}
            legend={t('modeSelection.title')}
            onSelect={setSelectedMode}
            selectedMode={selectedMode}
          />
          <Button
            disabled={selectedMode === undefined || busy}
            loading={operation === 'SELECT_MODE'}
            onClick={() =>
              void perform('SELECT_MODE', async () => {
                if (selectedMode === undefined) return;
                const transition = confirmMeetingMode(meeting, selectedMode, undefined, new Date());
                if (!transition.ok) throw transition.error;
                const saved = await repository.savePreparationTransition(
                  transition.value,
                  meeting.updatedAt,
                );
                if (!saved.ok) throw saved.error;
              })
            }
            size="large"
            type="primary"
          >
            {t('modeSelection.action')}
          </Button>
        </section>
      </main>
    );
  }

  async function completePending(
    turn: GrillTurn,
    disposition: 'ANSWERED' | 'UNKNOWN' | 'SKIPPED',
    value?: string,
    finish = false,
  ) {
    await perform('GRILL', async () => {
      const write = await answerCurrentGrillTurn(
        currentMeeting,
        turn,
        disposition,
        value,
        dependencies,
      );
      setAnswer('');
      setAnswerTurnId(undefined);
      setTextAnswerTurnId(undefined);
      const nextAggregate: MeetingAggregate = {
        ...currentAggregate,
        grillTurns: currentAggregate.grillTurns.map((item) =>
          item.id === write.turn.id ? write.turn : item,
        ),
        meeting: write.meeting,
      };
      if (finish) {
        await requestQuestion(nextAggregate, { finishRequested: true });
      } else if (turn.index < 5) {
        await requestQuestion(nextAggregate, {
          intent: 'CONTINUE_DEFAULT',
          requestedDimension,
        });
      }
    });
  }

  async function saveDraft(): Promise<MeetingAggregate> {
    if (
      meeting?.brief === undefined ||
      editor === undefined ||
      editor.meetingId !== meeting.id ||
      meeting.brief.confirmedAt !== undefined
    ) {
      throw new Error('INVALID_MEETING_STATE');
    }
    const saved = await repository.updateBriefDraft(
      meeting.id,
      updatedBrief(editor.base, editor.fields),
      editor.revision,
      new Date(),
    );
    if (!saved.ok) throw saved.error;
    const savedBrief = saved.value.brief;
    if (savedBrief === undefined || savedBrief.confirmedAt !== undefined) {
      throw new Error('INVALID_MEETING_STATE');
    }
    setEditor(briefEditor(saved.value.id, savedBrief, saved.value.updatedAt));
    return { ...currentAggregate, meeting: saved.value };
  }

  function loadSavedDraft() {
    if (
      meeting?.brief === undefined ||
      meeting.brief.confirmedAt !== undefined ||
      !window.confirm(t('brief.loadSavedConfirm'))
    ) {
      return;
    }
    setEditor(briefEditor(meeting.id, meeting.brief, meeting.updatedAt));
    setErrorCode(undefined);
  }

  async function rollback(kind: 'GRILL' | 'DRAFT') {
    if (
      !window.confirm(t(kind === 'GRILL' ? 'rollback.continueConfirm' : 'rollback.restartConfirm'))
    ) {
      return;
    }
    await perform('ROLLBACK', async () => {
      if (kind === 'GRILL') await returnToGrill(currentMeeting, repository);
      else {
        await returnToModeSelection(currentMeeting, repository);
        setSelectedMode(undefined);
      }
      setEditor(undefined);
    });
  }

  const readinessPanel = readiness ? (
    <aside aria-label={t('readiness.title')} className={styles.readinessPanel}>
      <div className={styles.readinessHeading}>
        <Typography.Title heading={2}>{t('readiness.title')}</Typography.Title>
        <Tag>{t(`readiness.levels.${readiness.level}`)}</Tag>
      </div>
      <div
        aria-label={`${t('readiness.title')}: ${t(`readiness.levels.${readiness.level}`)}`}
        className={styles.segments}
        role="img"
      >
        {readiness.dimensions.map((dimension) => (
          <span className={styles[`segment${dimension.status}`]} key={dimension.key} />
        ))}
      </div>
      <ul className={styles.dimensionList}>
        {readiness.dimensions.map((dimension: ReadinessDimension) => {
          const label = t.has(`dimensions.${dimension.key}`)
            ? t(`dimensions.${dimension.key}`)
            : dimension.key.replaceAll('_', ' ');
          const incomplete = dimension.status !== 'READY';
          return (
            <li key={dimension.key}>
              <button
                aria-pressed={requestedDimension === dimension.key}
                className={styles.dimensionButton}
                disabled={!incomplete || busy || pending === undefined}
                onClick={() => setRequestedDimension(dimension.key)}
                type="button"
              >
                <span aria-hidden="true">
                  {dimension.status === 'READY' ? '✓' : dimension.status === 'PARTIAL' ? '◐' : '○'}
                </span>
                <span>{label}</span>
                <small>{t(`readiness.statuses.${dimension.status}`)}</small>
              </button>
            </li>
          );
        })}
      </ul>
      {requestedDimension ? (
        <p className={styles.selectionNote}>{t('readiness.prioritySelected')}</p>
      ) : null}
    </aside>
  ) : null;

  if (meeting?.preparationStage === 'GRILLING') {
    const completedCount = aggregate.grillTurns.filter(
      ({ disposition }) => disposition !== 'PENDING',
    ).length;
    return (
      <main aria-busy={busy} className={styles.shell}>
        <h1 className={styles.srOnly}>{meeting.title}</h1>
        <header className={styles.topbar}>
          <div className={styles.brandCluster}>
            <div className={styles.meetingIdentity}>
              <strong>{meeting.title}</strong>
              <span>{t(`modes.${meeting.mode}`)}</span>
            </div>
          </div>
          <Tag>{t('localOnly')}</Tag>
        </header>
        <div aria-live="polite" className={styles.srOnly}>
          {busy ? t('working') : errorCode ? t('errors.title') : ''}
        </div>
        <section className={styles.grillLayout}>
          <div className={styles.grillColumn}>
            {errorAlert}
            <p className={styles.eyebrow}>
              {t('grill.round', { current: Math.min((pending?.index ?? completedCount) + 1, 10) })}
            </p>
            {aggregate.grillTurns.filter(({ disposition }) => disposition !== 'PENDING').length >
            0 ? (
              <details className={styles.history}>
                <summary>{t('grill.history', { count: completedCount })}</summary>
                <ol>
                  {aggregate.grillTurns
                    .filter(({ disposition }) => disposition !== 'PENDING')
                    .map((turn) => (
                      <li key={turn.id}>
                        <strong>{turn.question}</strong>
                        <span>{turn.answer ?? t(`grill.dispositions.${turn.disposition}`)}</span>
                      </li>
                    ))}
                </ol>
              </details>
            ) : null}
            {pending ? (
              <Card
                className={
                  pending.phase === 'CRITICAL_EXTRA' ? styles.criticalCard : styles.questionCard
                }
              >
                {pending.phase === 'CRITICAL_EXTRA' ? (
                  <Tag color="orange">{t('grill.critical')}</Tag>
                ) : null}
                <Typography.Title heading={2}>{pending.question}</Typography.Title>
                {pending.reason ? (
                  <p className={styles.reason}>{t('grill.why', { reason: pending.reason })}</p>
                ) : null}
                {pending.criticalExtraReason ? (
                  <Alert content={pending.criticalExtraReason} type="warning" />
                ) : null}
                {pending.questionType === 'SINGLE_CHOICE' && pending.options !== undefined ? (
                  answerMode === 'CHOICE' ? (
                    <fieldset className={styles.choiceFieldset}>
                      <legend>{t('grill.choiceLabel')}</legend>
                      <Radio.Group
                        direction="vertical"
                        disabled={busy}
                        name={`grill-answer-${pending.id}`}
                        onChange={(value) => {
                          const selected = pending.options?.find(
                            ({ value: optionValue }) => optionValue === String(value),
                          );
                          setAnswer(selected?.label ?? '');
                          setAnswerTurnId(pending.id);
                        }}
                        options={pending.options.map(({ label, value }) => ({ label, value }))}
                        value={selectedOptionValue}
                      />
                    </fieldset>
                  ) : (
                    <label className={styles.answerField}>
                      <span>{t('grill.answerLabel')}</span>
                      <Input.TextArea
                        autoFocus
                        disabled={busy}
                        maxLength={4000}
                        onChange={(value) => {
                          setAnswer(value);
                          setAnswerTurnId(pending.id);
                          setTextAnswerTurnId(pending.id);
                        }}
                        placeholder={t('grill.answerPlaceholder')}
                        rows={4}
                        value={currentAnswer}
                      />
                    </label>
                  )
                ) : (
                  <label className={styles.answerField}>
                    <span>{t('grill.answerLabel')}</span>
                    <Input.TextArea
                      autoFocus
                      disabled={busy}
                      maxLength={4000}
                      onChange={(value) => {
                        setAnswer(value);
                        setAnswerTurnId(pending.id);
                        setTextAnswerTurnId(pending.id);
                      }}
                      placeholder={t('grill.answerPlaceholder')}
                      rows={4}
                      value={currentAnswer}
                    />
                  </label>
                )}
                {pending.questionType === 'SINGLE_CHOICE' && pending.options !== undefined ? (
                  <Button
                    className={styles.choiceToggle}
                    disabled={busy}
                    onClick={() => {
                      setAnswer('');
                      setAnswerTurnId(pending.id);
                      if (answerMode === 'CHOICE') setTextAnswerTurnId(pending.id);
                      else setTextAnswerTurnId(undefined);
                    }}
                    size="small"
                    type="text"
                  >
                    {t(answerMode === 'CHOICE' ? 'grill.otherAnswer' : 'grill.useChoices')}
                  </Button>
                ) : null}
                <div className={styles.actionRow}>
                  <Button disabled={busy} onClick={() => void completePending(pending, 'UNKNOWN')}>
                    {t('actions.unknown')}
                  </Button>
                  <Button disabled={busy} onClick={() => void completePending(pending, 'SKIPPED')}>
                    {t('actions.skip')}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void completePending(pending, 'SKIPPED', undefined, true)}
                  >
                    {t('actions.finish')}
                  </Button>
                  <Button
                    disabled={busy || currentAnswer.trim() === ''}
                    loading={busy}
                    onClick={() => void completePending(pending, 'ANSWERED', currentAnswer.trim())}
                    type="primary"
                  >
                    {t('actions.submit')}
                  </Button>
                </div>
              </Card>
            ) : busy ? (
              <Card className={styles.questionCard}>
                <Spin dot />
                <p>{t('grill.nextQuestion')}</p>
              </Card>
            ) : completedCount >= 5 ? (
              <Card className={styles.questionCard}>
                <Typography.Title heading={2}>{t('grill.defaultComplete')}</Typography.Title>
                <p>{t('grill.defaultCompleteDescription')}</p>
                <div className={styles.actionRow}>
                  <Button
                    onClick={() =>
                      void perform('GRILL', () =>
                        requestQuestion(aggregate, { finishRequested: true }),
                      )
                    }
                    type="primary"
                  >
                    {t('actions.generateBrief')}
                  </Button>
                  {completedCount < 10 ? (
                    <Button
                      onClick={() =>
                        void perform('GRILL', () =>
                          requestQuestion(aggregate, {
                            intent: 'CONTINUE_USER',
                            requestedDimension,
                          }),
                        )
                      }
                    >
                      {t('actions.continueGrill', { current: completedCount, limit: 10 })}
                    </Button>
                  ) : null}
                </div>
              </Card>
            ) : (
              <Card className={styles.questionCard}>
                <Typography.Title heading={2}>{t('grill.resumeTitle')}</Typography.Title>
                <p>{t('grill.resumeDescription')}</p>
                <Button
                  onClick={() =>
                    void perform('GRILL', () => requestQuestion(aggregate, { requestedDimension }))
                  }
                  type="primary"
                >
                  {t('actions.retry')}
                </Button>
              </Card>
            )}
          </div>
          {readinessPanel}
        </section>
      </main>
    );
  }

  if (meeting?.preparationStage === 'BRIEF_READY' && meeting.brief !== undefined) {
    const locked = meeting.brief.confirmedAt !== undefined;
    return (
      <main aria-busy={busy} className={styles.shell}>
        <h1 className={styles.srOnly}>{meeting.title}</h1>
        <header className={styles.topbar}>
          <div className={styles.brandCluster}>
            <div className={styles.meetingIdentity}>
              <strong>{meeting.title}</strong>
              <span>{t(`modes.${meeting.mode}`)}</span>
            </div>
          </div>
          <Tag color={locked ? 'orange' : 'blue'}>
            {t(locked ? 'brief.locked' : 'brief.editable')}
          </Tag>
        </header>
        <section className={styles.briefLayout}>
          <div className={styles.briefColumn}>
            {errorAlert}
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>{t('brief.eyebrow')}</p>
                <Typography.Title heading={2}>{t('brief.title')}</Typography.Title>
              </div>
              {locked ? <p>{t('brief.lockedDescription')}</p> : <p>{t('brief.editDescription')}</p>}
            </div>
            {fields || locked ? (
              <div className={styles.briefGrid}>
                {briefFieldNames.map((field) => {
                  const value = locked
                    ? field === 'openingLine'
                      ? meeting.brief!.facilitation.openingLine
                      : Array.isArray(meeting.brief![field])
                        ? meeting.brief![field].join('\n')
                        : String(meeting.brief![field])
                    : fields![field];
                  return (
                    <label className={styles.briefField} key={field}>
                      <strong>{t(`brief.fields.${field}`)}</strong>
                      <Input.TextArea
                        disabled={locked || busy}
                        onChange={(next) =>
                          setEditor((current) =>
                            current
                              ? { ...current, fields: { ...current.fields, [field]: next } }
                              : current,
                          )
                        }
                        rows={field === 'objective' || field === 'desiredOutcome' ? 2 : 4}
                        value={value}
                      />
                    </label>
                  );
                })}
              </div>
            ) : null}
            <Alert content={t('brief.lockWarning')} type="warning" />
            <div className={styles.actionRow}>
              {!locked ? (
                <>
                  <Button
                    disabled={busy || fields === undefined}
                    onClick={() =>
                      void perform('SAVE_BRIEF', async () => {
                        await saveDraft();
                      })
                    }
                  >
                    {t('actions.saveDraft')}
                  </Button>
                  <Button
                    disabled={busy || fields === undefined}
                    loading={operation === 'GENERATE_MAP'}
                    onClick={() =>
                      void perform('GENERATE_MAP', async () => {
                        const saved = await saveDraft();
                        await lockBriefAndGenerateMap(saved, dependencies);
                      })
                    }
                    type="primary"
                  >
                    {t('actions.confirmGenerate')}
                  </Button>
                </>
              ) : (
                <Button
                  loading={operation === 'GENERATE_MAP'}
                  onClick={() =>
                    void perform('GENERATE_MAP', () =>
                      lockBriefAndGenerateMap(aggregate, dependencies),
                    )
                  }
                  type="primary"
                >
                  {t('actions.retryMap')}
                </Button>
              )}
              <Button disabled={busy} onClick={() => void rollback('GRILL')}>
                {t('actions.returnGrill')}
              </Button>
              <Button disabled={busy} onClick={() => void rollback('DRAFT')} status="danger">
                {t('actions.restart')}
              </Button>
            </div>
          </div>
          {readinessPanel}
        </section>
      </main>
    );
  }

  return (
    <main aria-busy={busy} className={styles.shell}>
      <h1 className={styles.srOnly}>{meeting?.title}</h1>
      <header className={styles.topbar}>
        <div className={styles.brandCluster}>
          <strong>{meeting?.title}</strong>
        </div>
        <Tag color="green">{t('map.ready')}</Tag>
      </header>
      <section className={styles.centeredPanel}>
        <div aria-hidden="true" className={styles.successMark}>
          ✓
        </div>
        <Typography.Title heading={2}>{t('map.title')}</Typography.Title>
        <Typography.Paragraph>
          {t('map.description', { count: aggregate.nodes.length })}
        </Typography.Paragraph>
        <div className={styles.actionRow}>
          <Link className={styles.primaryLink} href={`/meetings/${meeting?.id}`}>
            {t('actions.openCanvas')}
          </Link>
          <Button disabled={busy} onClick={() => void rollback('GRILL')}>
            {t('actions.returnGrill')}
          </Button>
          <Button disabled={busy} onClick={() => void rollback('DRAFT')} status="danger">
            {t('actions.restart')}
          </Button>
        </div>
      </section>
    </main>
  );
}

export function PreparationWorkspace(props: PreparationWorkspaceProps) {
  const t = useTranslations('preparation.metadata');

  return (
    <>
      <AppHeader title={t('title')} />
      <ProviderConfigGate>
        {(controller) => <PreparationWorkspaceBody {...props} controller={controller} />}
      </ProviderConfigGate>
    </>
  );
}
