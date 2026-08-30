import { Button } from '@arco-design/web-react';
import {
  BaseEdge,
  getSmoothStepPath,
  Handle,
  NodeToolbar,
  Position,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  IconBranch,
  IconBulb,
  IconExclamationCircle,
  IconThunderbolt,
} from '@arco-design/web-react/icon';
import type { ReactNode } from 'react';

import type { StrategyId } from '@/modules/mind-map-domain';

import styles from './meeting-canvas.module.css';

export interface MeetingCanvasNodeData extends Record<string, unknown> {
  activeLabel: string;
  dimmed: boolean;
  isActiveTopic: boolean;
  isOutcome: boolean;
  kindLabel: string;
  outcomeLabel: string;
  title: string;
  assistance?: {
    cancellable: boolean;
    cancelLabel: string;
    cards: Array<{
      description: string;
      disabled: boolean;
      id: StrategyId;
      label: string;
      loading: boolean;
      onActivate: () => void;
    }>;
    error?: { message: string; onRetry: () => void; retryLabel: string };
    groupLabel: string;
    onCancel: () => void;
  };
  skeleton?: boolean;
}

export interface MeetingCanvasEdgeData extends Record<string, unknown> {
  dimmed: boolean;
}

export type MeetingCanvasNode = Node<MeetingCanvasNodeData, 'meetingNode'>;
export type MeetingCanvasEdge = Edge<MeetingCanvasEdgeData, 'meetingEdge'>;

function strategyIcon(strategyId: StrategyId): ReactNode {
  if (strategyId.includes('RISK') || strategyId.includes('CHALLENGE')) {
    return <IconExclamationCircle aria-hidden />;
  }
  if (
    strategyId.includes('DECOMPOSE') ||
    strategyId.includes('CAUSE') ||
    strategyId.includes('ACTION')
  ) {
    return <IconBranch aria-hidden />;
  }
  if (strategyId.includes('DRIVE') || strategyId.includes('CONVERGE')) {
    return <IconThunderbolt aria-hidden />;
  }
  return <IconBulb aria-hidden />;
}

export function MeetingNode({ data, selected }: NodeProps<MeetingCanvasNode>) {
  if (data.skeleton) {
    return (
      <div aria-hidden className={styles.skeletonNode}>
        <span />
        <span />
      </div>
    );
  }
  return (
    <div
      className={styles.node}
      data-active-topic={data.isActiveTopic || undefined}
      data-dimmed={data.dimmed || undefined}
      data-outcome={data.isOutcome || undefined}
      data-selected={selected || undefined}
    >
      {data.assistance ? (
        <NodeToolbar
          className={`${styles.strategyToolbar} nodrag nopan`}
          isVisible
          offset={14}
          position={Position.Bottom}
        >
          <div
            aria-label={data.assistance.groupLabel}
            className={styles.strategyGroup}
            role="group"
          >
            <div className={styles.strategyCards}>
              {data.assistance.cards.map((card) => (
                <Button
                  className={styles.strategyCard}
                  disabled={card.disabled}
                  icon={strategyIcon(card.id)}
                  key={card.id}
                  loading={card.loading}
                  onClick={card.onActivate}
                  type="outline"
                >
                  <span className={styles.strategyCardCopy}>
                    <strong>{card.label}</strong>
                    <small>{card.description}</small>
                  </span>
                </Button>
              ))}
            </div>
            {data.assistance.cancellable ? (
              <Button onClick={data.assistance.onCancel} size="mini" type="text">
                {data.assistance.cancelLabel}
              </Button>
            ) : null}
            {data.assistance.error ? (
              <div className={styles.strategyError} role="alert">
                <span>{data.assistance.error.message}</span>
                <Button onClick={data.assistance.error.onRetry} size="mini" type="text">
                  {data.assistance.error.retryLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </NodeToolbar>
      ) : null}
      <Handle className={styles.handle} position={Position.Left} type="target" />
      <div className={styles.nodeMeta}>
        <span className={styles.nodeKind}>{data.kindLabel}</span>
        {data.isActiveTopic ? <span className={styles.activePill}>{data.activeLabel}</span> : null}
      </div>
      <span className={styles.nodeTitle}>{data.title}</span>
      {data.isOutcome ? <span className={styles.outcomePill}>{data.outcomeLabel}</span> : null}
      <Handle className={styles.handle} position={Position.Right} type="source" />
    </div>
  );
}

export function MeetingEdge({
  data,
  id,
  markerEnd,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<MeetingCanvasEdge>) {
  const [path] = getSmoothStepPath({
    borderRadius: 12,
    offset: 24,
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
  return (
    <BaseEdge
      className={data?.dimmed ? styles.edgeDimmed : styles.edge}
      id={id}
      markerEnd={markerEnd}
      path={path}
    />
  );
}

export const meetingNodeTypes = { meetingNode: MeetingNode };
export const meetingEdgeTypes = { meetingEdge: MeetingEdge };
