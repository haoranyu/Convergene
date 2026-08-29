import type { MeetingAggregate } from '@/modules/meeting-db';
import type { MeetingGraph, NodeKind } from '@/modules/mind-map-domain';

export type CanvasCommandErrorCode = 'INVALID_OPERATION' | 'STALE_WRITE' | 'STORAGE_ERROR';

export type CanvasCommandResult =
  { ok: true } | { error: { code: CanvasCommandErrorCode }; ok: false };

export interface ManualCanvasNodeDraft {
  kind: NodeKind;
  note?: string;
  parentNodeId: string;
  position: { x: number; y: number };
  title: string;
  topicPrompt?: string;
  transitionHint?: string;
}

export interface CanvasCommands {
  deleteSubtree(nodeId: string): Promise<CanvasCommandResult>;
  insertNode(input: ManualCanvasNodeDraft): Promise<CanvasCommandResult>;
  persistPosition(nodeId: string, position: { x: number; y: number }): Promise<CanvasCommandResult>;
  relayout(graph: MeetingGraph): Promise<CanvasCommandResult>;
  reparentNode(nodeId: string, parentNodeId: string): Promise<CanvasCommandResult>;
  setActiveTopic(topicNodeId: string): Promise<CanvasCommandResult>;
  updateNodeText(nodeId: string, title: string, note?: string): Promise<CanvasCommandResult>;
}

export interface MeetingCanvasViewProps {
  aggregate: MeetingAggregate;
  commands: CanvasCommands;
}
