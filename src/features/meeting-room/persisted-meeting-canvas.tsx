'use client';

import { Empty, Spin } from '@arco-design/web-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  MeetingDatabase,
  MeetingRepository,
  observeMeetingAggregate,
  type MeetingAggregate,
  type MeetingRepositoryErrorCode,
} from '@/modules/meeting-db';
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
  const database = useMemo(() => new MeetingDatabase(), []);
  const repository = useMemo(() => new MeetingRepository(database), [database]);
  const [aggregate, setAggregate] = useState<MeetingAggregate>();
  const [failedMeetingId, setFailedMeetingId] = useState<string>();
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

  useEffect(() => () => database.close(), [database]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const result = await repository.getMeetingAggregate(meetingId);
    if (!result.ok || result.value === undefined) return false;
    receiveAggregate(result.value);
    return true;
  }, [meetingId, receiveAggregate, repository]);

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
  return <MeetingCanvasView aggregate={aggregate} commands={commands} />;
}
