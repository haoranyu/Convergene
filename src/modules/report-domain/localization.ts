import type { MeetingMode, OutcomeKind, SupportedLocale } from '@/modules/meeting-domain';
import { isSupportedLocale } from '@/modules/meeting-domain';

/**
 * Intentional localization boundary for the report domain.
 *
 * The deterministic report layer cannot depend on next-intl runtime hooks, so
 * it carries complete per-locale default dictionaries. When the report UI and
 * assembler land (Issue #11 / P0-25), the feature layer may pass catalog
 * sourced labels via `resolveReportLabels(locale, overrides)`; overrides
 * replace whole top-level sections so a partial catalog can never leak
 * untranslated fragments.
 */

export interface ModeFactHeadings {
  DECISION: {
    decisions: string;
    unchosenOptions: string;
    risks: string;
  };
  BRAINSTORM: {
    candidateIdeas: string;
    exploredIdeas: string;
    assumptions: string;
  };
  RETRO: {
    insights: string;
    improvementActions: string;
  };
  GENERAL: Record<never, never>;
}

export interface ReportLabels {
  modes: Record<MeetingMode, string>;
  outcomeKinds: Record<OutcomeKind, string>;
  sections: {
    summary: string;
    outcomes: string;
    nextSteps: string;
    personTime: string;
    outcomeTimeline: string;
    parkingLot: string;
    unknowns: string;
  };
  /** Per-mode title for the script-specific section. */
  modeSections: Record<MeetingMode, string>;
  modeFactHeadings: ModeFactHeadings;
  charts: {
    modeFlowchart: Record<MeetingMode, string>;
    outcomeTimeline: string;
    personTime: string;
    meetingStarted: string;
    /** Overflow marker, e.g. "… {count} more". */
    moreItems: string;
    /** Pie aggregation slice for outcomes beyond the slice cap. */
    otherItems: string;
    unallocated: string;
    total: string;
  };
  table: {
    field: string;
    value: string;
    outcomeType: string;
    outcomeContent: string;
    owner: string;
    dueDate: string;
    note: string;
    formationCost: string;
    origin: string;
    minute: string;
    time: string;
    item: string;
    personHours: string;
  };
  fields: {
    mode: string;
    objective: string;
    plannedTime: string;
    actualTime: string;
    timezone: string;
    attendeeCount: string;
    totalPersonHours: string;
    unallocatedPersonHours: string;
    overtime: string;
  };
  empty: {
    outcomes: string;
    parkingLot: string;
    unknowns: string;
    nextSteps: string;
  };
  postMeetingTag: string;
  missingValue: string;
  /** "{value} person-hours" style templates; category picked via Intl.PluralRules. */
  personHours: { one: string; other: string };
  durationMinutes: { one: string; other: string };
  /** Timeline period label without a clock colon, e.g. "Minute {count}". */
  minutePeriod: string;
  estimateNote: string;
}

export type ReportLabelOverrides = {
  [Key in keyof ReportLabels]?: ReportLabels[Key];
};

const zhCN: ReportLabels = {
  modes: {
    DECISION: '决策对齐',
    BRAINSTORM: '脑暴共创',
    RETRO: '复盘改进',
    GENERAL: '通用讨论',
  },
  outcomeKinds: {
    DECISION: '决策',
    CANDIDATE_IDEA: '候选创意',
    INSIGHT: '洞察',
    ACTION: '行动项',
  },
  sections: {
    summary: '会议概要',
    outcomes: '会议产出',
    nextSteps: '下一步',
    personTime: '人时分配（估算）',
    outcomeTimeline: '产出时间线',
    parkingLot: '停车场',
    unknowns: '仍待确认',
  },
  modeSections: {
    DECISION: '决策明细',
    BRAINSTORM: '创意盘点',
    RETRO: '复盘要点',
    GENERAL: '通用讨论',
  },
  modeFactHeadings: {
    DECISION: {
      decisions: '最终决策',
      unchosenOptions: '未选方案',
      risks: '风险',
    },
    BRAINSTORM: {
      candidateIdeas: '入选候选',
      exploredIdeas: '探索过的创意',
      assumptions: '待验证假设',
    },
    RETRO: {
      insights: '经验与原因',
      improvementActions: '改进行动',
    },
    GENERAL: {},
  },
  charts: {
    modeFlowchart: {
      DECISION: '决策脉络',
      BRAINSTORM: '创意分组',
      RETRO: '原因到行动',
      GENERAL: '会议脉络',
    },
    outcomeTimeline: '产出时间线',
    personTime: '人时分配',
    meetingStarted: '会议开始',
    moreItems: '…另有 {count} 项',
    otherItems: '其他 {count} 项',
    unallocated: '未归属人时',
    total: '合计',
  },
  table: {
    field: '项目',
    value: '值',
    outcomeType: '类型',
    outcomeContent: '内容',
    owner: '负责人',
    dueDate: '截止时间',
    note: '备注',
    formationCost: '形成成本（人时，估算）',
    origin: '标记',
    minute: '分钟',
    time: '时间',
    item: '条目',
    personHours: '人时（估算）',
  },
  fields: {
    mode: '剧本',
    objective: '会议目标',
    plannedTime: '计划时间',
    actualTime: '实际时间',
    timezone: '时区',
    attendeeCount: '实际参会人数',
    totalPersonHours: '总人时（估算）',
    unallocatedPersonHours: '未归属人时（估算）',
    overtime: '超时',
  },
  empty: {
    outcomes: '本次会议未标记正式产出。',
    parkingLot: '本次没有停车场条目。',
    unknowns: '没有仍待确认的问题。',
    nextSteps: '本次会议没有行动项。',
  },
  postMeetingTag: '会后补记',
  missingValue: '—',
  personHours: { one: '{value} 人时', other: '{value} 人时' },
  durationMinutes: { one: '{value} 分钟', other: '{value} 分钟' },
  minutePeriod: '第 {count} 分钟',
  estimateNote: '人时与形成成本为估算值，不构成精确财务成本。',
};

const zhTW: ReportLabels = {
  modes: {
    DECISION: '決策對齊',
    BRAINSTORM: '腦力激盪',
    RETRO: '復盤改進',
    GENERAL: '一般討論',
  },
  outcomeKinds: {
    DECISION: '決策',
    CANDIDATE_IDEA: '候選點子',
    INSIGHT: '洞察',
    ACTION: '行動項目',
  },
  sections: {
    summary: '會議概要',
    outcomes: '會議產出',
    nextSteps: '下一步',
    personTime: '人時分配（估算）',
    outcomeTimeline: '產出時間線',
    parkingLot: '停車場',
    unknowns: '仍待確認',
  },
  modeSections: {
    DECISION: '決策明細',
    BRAINSTORM: '腦力激盪重點',
    RETRO: '復盤要點',
    GENERAL: '一般討論',
  },
  modeFactHeadings: {
    DECISION: {
      decisions: '最終決策',
      unchosenOptions: '未選方案',
      risks: '風險',
    },
    BRAINSTORM: {
      candidateIdeas: '入選候選',
      exploredIdeas: '探索過的點子',
      assumptions: '待驗證假設',
    },
    RETRO: {
      insights: '經驗與原因',
      improvementActions: '改進行動',
    },
    GENERAL: {},
  },
  charts: {
    modeFlowchart: {
      DECISION: '決策脈絡',
      BRAINSTORM: '點子分組',
      RETRO: '原因到行動',
      GENERAL: '會議脈絡',
    },
    outcomeTimeline: '產出時間線',
    personTime: '人時分配',
    meetingStarted: '會議開始',
    moreItems: '…另有 {count} 項',
    otherItems: '其他 {count} 項',
    unallocated: '未歸屬人時',
    total: '合計',
  },
  table: {
    field: '項目',
    value: '值',
    outcomeType: '類型',
    outcomeContent: '內容',
    owner: '負責人',
    dueDate: '截止時間',
    note: '備註',
    formationCost: '形成成本（人時，估算）',
    origin: '標記',
    minute: '分鐘',
    time: '時間',
    item: '條目',
    personHours: '人時（估算）',
  },
  fields: {
    mode: '劇本',
    objective: '會議目標',
    plannedTime: '計劃時間',
    actualTime: '實際時間',
    timezone: '時區',
    attendeeCount: '實際參會人數',
    totalPersonHours: '總人時（估算）',
    unallocatedPersonHours: '未歸屬人時（估算）',
    overtime: '超時',
  },
  empty: {
    outcomes: '本次會議未標記正式產出。',
    parkingLot: '本次沒有停車場條目。',
    unknowns: '沒有仍待確認的問題。',
    nextSteps: '本次會議沒有行動項目。',
  },
  postMeetingTag: '會後補記',
  missingValue: '—',
  personHours: { one: '{value} 人時', other: '{value} 人時' },
  durationMinutes: { one: '{value} 分鐘', other: '{value} 分鐘' },
  minutePeriod: '第 {count} 分鐘',
  estimateNote: '人時與形成成本為估算值，不構成精確財務成本。',
};

const enUS: ReportLabels = {
  modes: {
    DECISION: 'Decision & Alignment',
    BRAINSTORM: 'Brainstorm',
    RETRO: 'Retrospective',
    GENERAL: 'General Discussion',
  },
  outcomeKinds: {
    DECISION: 'Decision',
    CANDIDATE_IDEA: 'Candidate idea',
    INSIGHT: 'Insight',
    ACTION: 'Action item',
  },
  sections: {
    summary: 'Meeting summary',
    outcomes: 'Meeting outcomes',
    nextSteps: 'Next steps',
    personTime: 'Person-hour allocation (estimate)',
    outcomeTimeline: 'Outcome timeline',
    parkingLot: 'Parking lot',
    unknowns: 'Still open',
  },
  modeSections: {
    DECISION: 'Decision details',
    BRAINSTORM: 'Idea inventory',
    RETRO: 'Retro highlights',
    GENERAL: 'General discussion',
  },
  modeFactHeadings: {
    DECISION: {
      decisions: 'Final decisions',
      unchosenOptions: 'Options not chosen',
      risks: 'Risks',
    },
    BRAINSTORM: {
      candidateIdeas: 'Selected candidates',
      exploredIdeas: 'Explored ideas',
      assumptions: 'Assumptions to verify',
    },
    RETRO: {
      insights: 'Insights and causes',
      improvementActions: 'Improvement actions',
    },
    GENERAL: {},
  },
  charts: {
    modeFlowchart: {
      DECISION: 'Decision flow',
      BRAINSTORM: 'Idea groups',
      RETRO: 'From causes to actions',
      GENERAL: 'Meeting flow',
    },
    outcomeTimeline: 'Outcome timeline',
    personTime: 'Person-hour allocation',
    meetingStarted: 'Meeting started',
    moreItems: '… {count} more',
    otherItems: '{count} other items',
    unallocated: 'Unattributed',
    total: 'Total',
  },
  table: {
    field: 'Field',
    value: 'Value',
    outcomeType: 'Type',
    outcomeContent: 'Outcome',
    owner: 'Owner',
    dueDate: 'Due',
    note: 'Note',
    formationCost: 'Formation cost (person-hours, estimate)',
    origin: 'Marking',
    minute: 'Minute',
    time: 'Time',
    item: 'Item',
    personHours: 'Person-hours (estimate)',
  },
  fields: {
    mode: 'Script',
    objective: 'Objective',
    plannedTime: 'Planned',
    actualTime: 'Actual',
    timezone: 'Time zone',
    attendeeCount: 'Attendees',
    totalPersonHours: 'Total person-hours (estimate)',
    unallocatedPersonHours: 'Unattributed person-hours (estimate)',
    overtime: 'Overtime',
  },
  empty: {
    outcomes: 'No formal outcomes were marked in this meeting.',
    parkingLot: 'No parking-lot items.',
    unknowns: 'No open questions remain.',
    nextSteps: 'No action items from this meeting.',
  },
  postMeetingTag: 'Post-meeting note',
  missingValue: '—',
  personHours: { one: '{value} person-hour', other: '{value} person-hours' },
  durationMinutes: { one: '{value} minute', other: '{value} minutes' },
  minutePeriod: 'Minute {count}',
  estimateNote: 'Person-hours and formation costs are estimates, not exact financial costs.',
};

export const defaultReportLabels: Record<SupportedLocale, ReportLabels> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en-US': enUS,
};

export function resolveReportLabels(
  locale: SupportedLocale,
  overrides?: ReportLabelOverrides,
): ReportLabels {
  const base = defaultReportLabels[isSupportedLocale(locale) ? locale : 'zh-CN'];
  return overrides === undefined ? base : { ...base, ...overrides };
}

export function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );
}

/** Display formatting only: the domain keeps minutes; rendering rounds to 0.1 hour. */
export function formatPersonHours(
  personMinutes: number,
  locale: SupportedLocale,
  labels: ReportLabels,
): string {
  const hours = personMinutes / 60;
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(hours);
  const category = new Intl.PluralRules(locale).select(hours) === 'one' ? 'one' : 'other';
  return interpolate(labels.personHours[category], { value });
}

export function formatDurationMinutes(
  minutes: number,
  locale: SupportedLocale,
  labels: ReportLabels,
): string {
  const rounded = Math.round(minutes);
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(rounded);
  const category = new Intl.PluralRules(locale).select(rounded) === 'one' ? 'one' : 'other';
  return interpolate(labels.durationMinutes[category], { value });
}

/** Locale-aware wall clock in the explicitly supplied time zone. */
export function formatDateTime(isoUtc: string, locale: SupportedLocale, timezone: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).format(new Date(isoUtc));
}

export function formatTimeRange(
  range: { start?: string; end?: string },
  locale: SupportedLocale,
  timezone: string,
  missingValue: string,
): string {
  const start =
    range.start === undefined ? missingValue : formatDateTime(range.start, locale, timezone);
  const end = range.end === undefined ? missingValue : formatDateTime(range.end, locale, timezone);
  return `${start} – ${end}`;
}
