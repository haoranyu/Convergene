export const supportedLocales = ['zh-CN', 'zh-TW', 'en-US'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale);
}

export const meetingModes = ['DECISION', 'BRAINSTORM', 'RETRO', 'GENERAL'] as const;
export type MeetingMode = (typeof meetingModes)[number];

export const meetingStatuses = ['PREPARING', 'LIVE', 'ENDED'] as const;
export type MeetingStatus = (typeof meetingStatuses)[number];

export const preparationStages = ['DRAFT', 'GRILLING', 'BRIEF_READY', 'MAP_READY'] as const;
export type PreparationStage = (typeof preparationStages)[number];

export const readinessLevels = ['INSUFFICIENT', 'BARELY_READY', 'READY'] as const;
export type ReadinessLevel = (typeof readinessLevels)[number];

export const outcomeKinds = ['DECISION', 'CANDIDATE_IDEA', 'INSIGHT', 'ACTION'] as const;
export type OutcomeKind = (typeof outcomeKinds)[number];

export type TimingState =
  'PREPARING' | 'WAITING_TO_START' | 'LIVE' | 'LIVE_OVERRUN' | 'ENDED_ON_TIME' | 'ENDED_OVERRUN';

export interface MeetingTiming {
  endedAt?: string;
  scheduledEndAt: string;
  scheduledStartAt: string;
  status: MeetingStatus;
}

export interface ReadinessDimension {
  key: string;
  status: 'MISSING' | 'PARTIAL' | 'READY';
  summary?: string;
}

export interface MeetingBriefContent {
  objective: string;
  desiredOutcome: string;
  confirmed: string[];
  assumptions: string[];
  unknowns: string[];
  readiness: {
    level: ReadinessLevel;
    dimensions: ReadinessDimension[];
  };
  facilitation: {
    openingLine: string;
    closingChecklist: string[];
  };
}

export interface MeetingBriefDraft extends MeetingBriefContent {
  confirmedAt?: never;
}

export interface MeetingBriefSnapshot extends MeetingBriefContent {
  confirmedAt: string;
}

export interface MeetingReport {
  locale: SupportedLocale;
  markdown: string;
  generatedAt: string;
  sourceUpdatedAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  rawRequest: string;
  mode?: MeetingMode;
  modeReason?: string;
  status: MeetingStatus;
  preparationStage: PreparationStage;
  contentLocale: SupportedLocale;
  scheduledStartAt: string;
  scheduledEndAt: string;
  expectedAttendeeCount: number;
  actualAttendeeCount?: number;
  startedAt?: string;
  endedAt?: string;
  activeTopicNodeId?: string;
  brief?: MeetingBriefDraft | MeetingBriefSnapshot;
  report?: MeetingReport;
  createdAt: string;
  updatedAt: string;
}

export type GrillTurnDisposition = 'ANSWERED' | 'UNKNOWN' | 'SKIPPED';

export interface GrillTurn {
  id: string;
  meetingId: string;
  index: number;
  question: string;
  reason?: string;
  answer?: string;
  disposition: GrillTurnDisposition;
  createdAt: string;
}

export interface MeetingOutcome {
  id: string;
  meetingId: string;
  nodeId: string;
  kind: OutcomeKind;
  origin: 'LIVE' | 'POST_MEETING';
  markedAt?: string;
  owner?: string;
  dueDate?: string;
  note?: string;
}

export type MeetingDomainErrorCode =
  | 'ACTIVE_MEETING_EXISTS'
  | 'BRIEF_ALREADY_CONFIRMED'
  | 'BRIEF_NOT_CONFIRMED'
  | 'INVALID_ATTENDEE_COUNT'
  | 'INVALID_BRIEF'
  | 'INVALID_MEETING'
  | 'INVALID_MEETING_STATE'
  | 'INVALID_OUTCOME'
  | 'INVALID_TIME_RANGE'
  | 'OUTCOME_ALREADY_EXISTS';
