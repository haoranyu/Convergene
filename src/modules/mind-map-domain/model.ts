export const nodeKinds = [
  'OBJECTIVE',
  'TOPIC',
  'OPTION',
  'IDEA',
  'RISK',
  'INSIGHT',
  'ACTION',
  'NOTE',
  'PARKING',
] as const;
export type NodeKind = (typeof nodeKinds)[number];

export const strategyIds = [
  'DECISION_ADD_OPTION',
  'DECISION_SURFACE_RISK',
  'DECISION_DRIVE_CHOICE',
  'BRAINSTORM_GO_WILDER',
  'BRAINSTORM_CHANGE_LENS',
  'BRAINSTORM_CONVERGE',
  'RETRO_FIND_CAUSE',
  'RETRO_FIND_COUNTEREXAMPLE',
  'RETRO_TURN_INTO_ACTION',
  'GENERAL_DIVERGE',
  'GENERAL_DECOMPOSE',
  'GENERAL_CHALLENGE',
] as const;
export type StrategyId = (typeof strategyIds)[number];

export interface ParentSuggestion {
  recommendedParentNodeId: string;
  alternativeParentNodeIds: string[];
  rationale: string;
  createdAt: string;
}

export interface MindMapNode {
  id: string;
  meetingId: string;
  kind: NodeKind;
  title: string;
  note?: string;
  position: { x: number; y: number };
  source: 'USER' | 'INITIAL_AI' | 'EXPANSION_AI' | 'QUICK_NOTE';
  strategyId?: StrategyId;
  topicPrompt?: string;
  transitionHint?: string;
  parentSuggestion?: ParentSuggestion;
  createdAt: string;
  updatedAt: string;
}

export interface MindMapEdge {
  id: string;
  meetingId: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: 'CONTAINS';
  order?: number;
}

export interface MeetingGraph {
  meetingId: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

export interface ExpansionChild {
  node: MindMapNode;
  edgeId: string;
  order?: number;
}

export type GraphErrorCode =
  | 'CYCLE'
  | 'DISCONNECTED_GRAPH'
  | 'DUPLICATE_EDGE_ID'
  | 'DUPLICATE_NODE_ID'
  | 'EXPANSION_COUNT'
  | 'INITIAL_DEPTH'
  | 'INITIAL_NODE_COUNT'
  | 'INITIAL_TOPIC_COUNT'
  | 'INVALID_EDGE'
  | 'INVALID_DELETE'
  | 'INVALID_EXPANSION'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_INSERT'
  | 'INVALID_MEETING_MEMBERSHIP'
  | 'INVALID_NODE'
  | 'INVALID_PARENT_SUGGESTION'
  | 'INVALID_POSITION'
  | 'INVALID_REPARENT'
  | 'INVALID_STRATEGY'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TITLE'
  | 'INVALID_TOPIC'
  | 'INVALID_TOPIC_ORDER'
  | 'NODE_NOT_FOUND'
  | 'PARENT_COUNT'
  | 'ROOT_COUNT'
  | 'ROOT_KIND';

export interface GraphSummary {
  depth: number;
  rootNodeId: string;
  topicNodeIds: string[];
}
