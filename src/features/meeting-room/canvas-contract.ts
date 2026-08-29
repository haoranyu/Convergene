import type { MeetingAggregate } from '@/modules/meeting-db';
import type {
  ExpandNodeChild,
  ExpandNodeRequest,
  ExpandNodeResponse,
  MeetingAIResult,
} from '@/modules/meeting-ai/expand-node';
import type { MeetingGraph, MindMapNode, NodeKind, StrategyId } from '@/modules/mind-map-domain';

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

export interface ApplyExpansionDraft {
  children: readonly ExpandNodeChild[];
  expectedMeetingUpdatedAt: string;
  parentNodeId: string;
  strategyId: StrategyId;
}

export interface QuickNoteDraft {
  parentNodeId: string;
  position: { x: number; y: number };
  title: string;
}

export type ExpandNodePort = (
  request: ExpandNodeRequest,
  options: { signal: AbortSignal },
) => Promise<MeetingAIResult<ExpandNodeResponse>>;

export interface CanvasCommands {
  applyExpansion(input: ApplyExpansionDraft): Promise<CanvasCommandResult>;
  deleteSubtree(nodeId: string): Promise<CanvasCommandResult>;
  insertQuickNote(input: QuickNoteDraft): Promise<CanvasCommandResult>;
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
  expandNode: ExpandNodePort;
  onSelectedNodeChange?: (node?: MindMapNode) => void;
}
