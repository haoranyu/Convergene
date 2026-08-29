'use client';

import { Button, Empty, Spin } from '@arco-design/web-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createLiveMeetingCommands,
  EndMeetingDialog,
  LiveMeetingToolbar,
  OutcomePanel,
  StartMeetingDialog,
} from '@/features/live-meeting';
import { ReportWorkspace } from '@/features/report';
import { useRouter } from '@/i18n/navigation';
import {
  MeetingRepository,
  observeMeetingAggregate,
  type MeetingAggregate,
  type MeetingRepositoryErrorCode,
} from '@/modules/meeting-db';
import { getBrowserMeetingDatabase } from '@/modules/meeting-db/client';
import type { MindMapNode } from '@/modules/mind-map-domain';
import { layoutMeetingGraph } from '@/modules/mind-map-layout';

import type { CanvasCommandResult, CanvasCommands, ManualCanvasNodeDraft } from './canvas-contract';
import { MeetingCanvasView } from './meeting-canvas-view';
import styles from './meeting-canvas.module.css';

export interface PersistedMeetingCanvasProps {
  meetingId: string;
}

function commandFailure(code: MeetingRepositoryErrorCode): CanvasCommandResult {
  return {
    error: { code: code === 'STALE_WRITE' ? 'STALE_WRITE' : 'INVALID_OPERATION' },
    ok: false,
  };
}

export function PersistedMeetingCanvas({ meetingId }: PersistedMeetingCanvasProps) {
  const t = useTranslations('mindMap');
  const meetingT = useTranslations('meeting');
  const router = useRouter();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const database = useMemo(() => getBrowserMeetingDatabase(), []);
  const repository = useMemo(() => new MeetingRepository(database), [database]);
  const [aggregate, setAggregate] = useState<MeetingAggregate>();
  const [failedMeetingId, setFailedMeetingId] = useState<string>();
  const [activeMeetingId, setActiveMeetingId] = useState<string>();
  const [endOpen, setEndOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<MindMapNode>();
  const [startOpen, setStartOpen] = useState(false);
  const aggregateRef = useRef<MeetingAggregate | undefined>(undefined);

  const receiveAggregate = useCallback((next: MeetingAggregate | undefined) => {
    aggregateRef.current = next;
    setAggregate(next);
  }, []);

  useEffect(() => {
    const unsubscribe = observeMeetingAggregate(database, meetingId, receiveAggregate, () => {
      setFailedMeetingId(meetingId);
    });
    return () => unsubscribe();
  }, [database, meetingId, receiveAggregate]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const [result, activeId] = await Promise.all([
      repository.getMeetingAggregate(meetingId),
      repository.getActiveMeetingId(),
    ]);
    setActiveMeetingId(activeId);
    if (!result.ok || result.value === undefined) return false;
    receiveAggregate(result.value);
    return true;
  }, [meetingId, receiveAggregate, repository]);

  useEffect(() => {
    void repository.getActiveMeetingId().then(setActiveMeetingId);
  }, [aggregate?.meeting.updatedAt, repository]);

  const execute = useCallback(
    async (
      operation: (
        current: MeetingAggregate,
      ) => Promise<{ ok: boolean; error?: { code: MeetingRepositoryErrorCode } }>,
    ): Promise<CanvasCommandResult> => {
      const current = aggregateRef.current;
      if (current === undefined) {
        return { error: { code: 'INVALID_OPERATION' }, ok: false };
      }
      try {
        const result = await operation(current);
        if (!result.ok) return commandFailure(result.error!.code);
        return (await refresh()) ? { ok: true } : { error: { code: 'STORAGE_ERROR' }, ok: false };
      } catch {
        return { error: { code: 'STORAGE_ERROR' }, ok: false };
      }
    },
    [refresh],
  );

  const commands = useMemo<CanvasCommands>(
    () => ({
      deleteSubtree: (nodeId) =>
        execute((current) =>
          repository.deleteNodeSubtree(meetingId, nodeId, current.meeting.updatedAt, new Date()),
        ),
      insertNode: (input: ManualCanvasNodeDraft) =>
        execute((current) =>
          repository.insertNode(
            meetingId,
            {
              ...input,
              edgeId: crypto.randomUUID(),
              id: crypto.randomUUID(),
            },
            current.meeting.updatedAt,
            new Date(),
          ),
        ),
      persistPosition: (nodeId, position) =>
        execute((current) =>
          repository.updateNodePositions(
            meetingId,
            [{ nodeId, position }],
            current.meeting.updatedAt,
            new Date(),
          ),
        ),
      relayout: (graph) =>
        execute((current) => {
          const now = new Date();
          const layout = layoutMeetingGraph(graph, now.toISOString());
          if (!layout.ok) {
            return Promise.resolve({
              error: { code: 'INVALID_EDGE' as const },
              ok: false as const,
            });
          }
          return repository.replaceGraph(layout.value, current.meeting.updatedAt, now);
        }),
      reparentNode: (nodeId, parentNodeId) =>
        execute((current) =>
          repository.reparentNode(
            meetingId,
            nodeId,
            parentNodeId,
            current.meeting.updatedAt,
            new Date(),
          ),
        ),
      setActiveTopic: (topicNodeId) =>
        execute((current) =>
          repository.setActiveTopic(meetingId, topicNodeId, current.meeting.updatedAt, new Date()),
        ),
      updateNodeText: (nodeId, title, note) =>
        execute((current) =>
          repository.updateNodeText(
            meetingId,
            nodeId,
            { note, title },
            current.meeting.updatedAt,
            new Date(),
          ),
        ),
    }),
    [execute, meetingId, repository],
  );

  const liveCommands = useMemo(
    () => (aggregate ? createLiveMeetingCommands(repository, aggregate.meeting) : undefined),
    [aggregate, repository],
  );

  if (failedMeetingId === meetingId) {
    return <Empty className={styles.state} description={t('errors.storage')} />;
  }
  if (aggregate === undefined) {
    return (
      <div className={styles.state} role="status">
        <Spin aria-label={t('loading')} />
        <span>{t('loading')}</span>
      </div>
    );
  }
  const existingOutcome = selectedNode
    ? aggregate.outcomes.find((outcome) => outcome.nodeId === selectedNode.id)
    : undefined;

  return (
    <div className={styles.meetingWorkspace}>
      {aggregate.meeting.status === 'PREPARING' ? (
        <div className={styles.lifecycleControls}>
          <Button onClick={() => setStartOpen(true)} type="primary">
            {meetingT('actions.start')}
          </Button>
        </div>
      ) : null}
      {aggregate.meeting.status === 'LIVE' ? (
        <LiveMeetingToolbar
          meeting={aggregate.meeting}
          onEndRequest={() => setEndOpen(true)}
          outcomes={aggregate.outcomes}
        />
      ) : null}
      <MeetingCanvasView
        aggregate={aggregate}
        commands={commands}
        onSelectedNodeChange={setSelectedNode}
      />
      {aggregate.meeting.status === 'LIVE' && selectedNode && liveCommands ? (
        <div className={styles.outcomeDock}>
          <OutcomePanel
            existingOutcome={existingOutcome}
            meeting={aggregate.meeting}
            node={selectedNode}
            onMark={liveCommands.markOutcome}
            onUnmark={liveCommands.unmarkOutcome}
            onUpdate={liveCommands.updateOutcome}
          />
        </div>
      ) : null}
      {aggregate.meeting.status === 'ENDED' ? (
        <ReportWorkspace aggregate={aggregate} timezone={timezone} />
      ) : null}
      {liveCommands ? (
        <>
          <StartMeetingDialog
            activeMeetingId={activeMeetingId}
            meeting={aggregate.meeting}
            onCancel={() => setStartOpen(false)}
            onOpenActiveMeeting={(id) => router.push(`/meetings/${id}`)}
            onRequestEndActiveMeeting={(id) => router.push(`/meetings/${id}`)}
            onStarted={() => {
              setStartOpen(false);
              void refresh();
            }}
            onStart={liveCommands.start}
            open={startOpen}
          />
          <EndMeetingDialog
            meeting={aggregate.meeting}
            nodes={aggregate.nodes}
            onCancel={() => setEndOpen(false)}
            onEnd={liveCommands.end}
            onEnded={() => {
              setEndOpen(false);
              void refresh();
            }}
            open={endOpen}
            outcomes={aggregate.outcomes}
          />
        </>
      ) : null}
    </div>
  );
}
