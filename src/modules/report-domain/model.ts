import type { MeetingMode, OutcomeKind } from '@/modules/meeting-domain';
import type { NodeKind } from '@/modules/mind-map-domain';

/**
 * Deterministic bounds for generated Mermaid source. They exist so a long
 * meeting can never produce unbounded diagram text; overflow is always
 * surfaced as an explicit, factual "N more" marker instead of silent drops.
 */
export const reportMermaidLimits = {
  maxCharts: 3,
  maxFlowchartNodes: 24,
  maxLabelGraphemes: 48,
  maxPieSlices: 12,
  maxTimelineEvents: 24,
} as const;

/** ISO 8601 UTC endpoints; a missing endpoint stays missing, never invented. */
export interface ReportTimeRange {
  start?: string;
  end?: string;
}

export interface ReportSchedule {
  planned: ReportTimeRange;
  actual: ReportTimeRange;
  /** IANA time zone name supplied explicitly by the caller. */
  timezone: string;
}

export interface ReportOutcomeFact {
  nodeId: string;
  kind: OutcomeKind;
  title: string;
  note?: string;
  owner?: string;
  dueDate?: string;
  origin: 'LIVE' | 'POST_MEETING';
  /** Only present for LIVE outcomes; post-meeting additions never carry one. */
  markedAt?: string;
  /** Only present for LIVE outcomes; post-meeting additions are excluded from costs. */
  formationPersonMinutes?: number;
}

/**
 * Outcome-relevant projection of the discussion tree. `parentNodeId` is the
 * nearest *included* ancestor, so intermediate nodes that the report does not
 * care about are elided without inventing relationships; `order` is the
 * node's own incoming CONTAINS edge order and survives that bridging.
 */
export interface ReportTreeNode {
  nodeId: string;
  kind: NodeKind;
  title: string;
  parentNodeId?: string;
  isOutcome: boolean;
  order?: number;
  createdAt: string;
}

/**
 * The complete deterministic fact base for a report. It is a superset of the
 * AI-facing contract in docs/ai-contracts.md §9: charts and fallback tables
 * need node references and mark times that the model must not receive.
 * `toReportAIFacts` projects this down to the exact contract shape.
 */
export interface ReportFacts {
  mode: MeetingMode;
  title: string;
  objective: string;
  schedule: ReportSchedule;
  attendeeCount: number;
  totalPersonMinutes: number;
  overtimeMinutes: number;
  unallocatedPersonMinutes: number;
  /** LIVE outcomes first (chronological by markedAt), then POST_MEETING additions. */
  outcomes: ReportOutcomeFact[];
  parkingLot: string[];
  unknowns: string[];
  /** Stable, language-independent keys; values are verbatim fact strings. */
  modeFacts: Record<string, string[]>;
  /** Mode-filtered discussion tree used by the Mermaid flowchart. */
  discussionTree: ReportTreeNode[];
}

/** Exact input shape the report AI task may receive (docs/ai-contracts.md §9). */
export interface ReportAIOutcomeFact {
  kind: OutcomeKind;
  title: string;
  note?: string;
  owner?: string;
  dueDate?: string;
  origin: 'LIVE' | 'POST_MEETING';
  formationPersonMinutes?: number;
}

export interface ReportAIFacts {
  mode: MeetingMode;
  objective: string;
  schedule: ReportSchedule;
  attendeeCount: number;
  totalPersonMinutes: number;
  overtimeMinutes: number;
  outcomes: ReportAIOutcomeFact[];
  parkingLot: string[];
  unknowns: string[];
  modeFacts: Record<string, string[]>;
}

export type MermaidChartId = 'mode-flowchart' | 'outcome-timeline' | 'person-time';

export type MermaidDiagramType = 'flowchart' | 'timeline' | 'pie';

export interface MermaidChart {
  id: MermaidChartId;
  diagramType: MermaidDiagramType;
  /** Localized title; the report UI places it as the chart heading. */
  title: string;
  /** Program-generated Mermaid source; never model-generated. */
  source: string;
}

export type ReportSectionId =
  | 'summary'
  | 'mode-facts'
  | 'outcomes'
  | 'next-steps'
  | 'person-time'
  | 'outcome-timeline'
  | 'parking-lot'
  | 'unknowns';

export interface MarkdownSection {
  id: ReportSectionId;
  /** Localized section title without any Markdown heading marker. */
  title: string;
  /** Section body: GFM tables and lists derived from the same facts as the charts. */
  markdown: string;
}

export type ReportDomainErrorCode =
  | 'GRAPH_INVALID'
  | 'INVALID_ATTENDEE_COUNT'
  | 'INVALID_MEETING_STATE'
  | 'INVALID_OUTCOME'
  | 'INVALID_TIMEZONE'
  | 'INVALID_TIME_RANGE'
  | 'MEETING_NOT_ENDED'
  | 'OUTCOME_NODE_MISSING';

/**
 * Stable, language-independent mode-fact keys, in deterministic emission
 * order. Headings come from the localization boundary, never from this list.
 * GENERAL intentionally derives nothing beyond the common report base.
 */
export const modeFactKeys = {
  DECISION: ['decisions', 'unchosenOptions', 'risks'],
  BRAINSTORM: ['candidateIdeas', 'exploredIdeas', 'assumptions'],
  RETRO: ['insights', 'improvementActions'],
  GENERAL: [],
} as const satisfies Record<MeetingMode, readonly string[]>;
