import type { MeetingMode, OutcomeKind } from '@/modules/meeting-domain';

export interface ReportTimeRange {
  endAt: string;
  startAt: string;
}

export interface ReportOutcomeFact {
  dueDate?: string;
  formationPersonMinutes?: number;
  kind: OutcomeKind;
  markedAt?: string;
  note?: string;
  origin: 'LIVE' | 'POST_MEETING';
  owner?: string;
  title: string;
}

export const reportModeFactKeys = {
  BRAINSTORM: ['brainstorm_candidates', 'brainstorm_ideas', 'brainstorm_groups'],
  DECISION: ['decision_outcomes', 'decision_options', 'decision_risks'],
  GENERAL: ['general_outcomes'],
  RETRO: ['retro_insights', 'retro_actions', 'retro_causes'],
} as const satisfies Record<MeetingMode, readonly string[]>;

export type ReportModeFactKey = (typeof reportModeFactKeys)[MeetingMode][number];

export interface ReportFacts {
  attendeeCount: number;
  mode: MeetingMode;
  modeFacts: Record<ReportModeFactKey, string[]>;
  objective: string;
  outcomes: ReportOutcomeFact[];
  overtimeMinutes: number;
  parkingLot: string[];
  schedule: {
    actual: ReportTimeRange;
    planned: ReportTimeRange;
    timezone: string;
  };
  title: string;
  totalPersonMinutes: number;
  unallocatedPersonMinutes: number;
  unknowns: string[];
}

export interface ReportPolishSection {
  bullets: string[];
  headingKey: ReportModeFactKey;
  paragraphs: string[];
}

export interface ReportPolishOutput {
  closingSummary: string;
  executiveSummary: string;
  modeSections: ReportPolishSection[];
}

export interface ReportDocumentCopy {
  chartData: string;
  charts: {
    allocation: string;
    formation: string;
    from: string;
    minute: string;
    narrative: string;
    outcome: string;
    personMinutes: string;
    start: string;
    timeline: string;
    to: string;
    unallocated: string;
  };
  empty: {
    modeFact: string;
    nextSteps: string;
    outcomes: string;
    parkingLot: string;
    unknowns: string;
  };
  estimatedFormationEffort: string;
  headings: {
    diagrams: string;
    executiveSummary: string;
    meetingFacts: string;
    modeDetails: string;
    nextSteps: string;
    outcomes: string;
    parkingLot: string;
    unresolved: string;
  };
  labels: {
    actualTime: string;
    attendees: string;
    dueDate: string;
    mode: string;
    origin: string;
    overtime: string;
    owner: string;
    plannedTime: string;
    reportLocale: string;
    timezone: string;
    totalPersonHours: string;
    unallocatedPersonHours: string;
  };
  modeFacts: Record<ReportModeFactKey, string>;
  modes: Record<MeetingMode, string>;
  noFormalOutcomesSummary: string;
  notSet: string;
  origin: {
    live: string;
    postMeeting: string;
  };
  outcomeKinds: Record<OutcomeKind, string>;
  reportTitle: string;
}

export interface MermaidChart {
  definition: string;
  fallbackMarkdown: string;
  id: string;
  title: string;
  type: 'ALLOCATION' | 'MODE_NARRATIVE' | 'OUTCOME_TIMELINE';
}

export interface ReportGenerationDraft {
  charts: MermaidChart[];
  facts: ReportFacts;
  markdown: string;
  polishFailure?: 'OUTPUT_INVALID' | 'TRANSPORT_FAILED';
  usedFactDraft: boolean;
}
