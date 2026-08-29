import {
  BaseEdge,
  getSmoothStepPath,
  Handle,
  Position,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';

import styles from './meeting-canvas.module.css';

export interface MeetingCanvasNodeData extends Record<string, unknown> {
  activeLabel: string;
  dimmed: boolean;
  isActiveTopic: boolean;
  isOutcome: boolean;
  kindLabel: string;
  outcomeLabel: string;
  title: string;
}

export interface MeetingCanvasEdgeData extends Record<string, unknown> {
  dimmed: boolean;
}

export type MeetingCanvasNode = Node<MeetingCanvasNodeData, 'meetingNode'>;
export type MeetingCanvasEdge = Edge<MeetingCanvasEdgeData, 'meetingEdge'>;

export function MeetingNode({ data, selected }: NodeProps<MeetingCanvasNode>) {
  return (
    <div
      className={styles.node}
      data-active-topic={data.isActiveTopic || undefined}
      data-dimmed={data.dimmed || undefined}
      data-outcome={data.isOutcome || undefined}
      data-selected={selected || undefined}
    >
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
