import type { SupportedLocale } from '@/modules/meeting-domain';

import {
  formatDateTime,
  formatDurationMinutes,
  formatPersonHours,
  formatTimeRange,
  resolveReportLabels,
} from './localization';
import type { ReportLabelOverrides, ReportLabels } from './localization';
import { modeFactKeys } from './model';
import type { MarkdownSection, ReportFacts, ReportOutcomeFact } from './model';

export interface FallbackTableOptions {
  labels?: ReportLabelOverrides;
}

/**
 * Escape user text for inline Markdown (list items, prose): collapse line
 * breaks, then neutralize backslash and angle brackets so user text can
 * never turn into raw HTML nodes that react-markdown drops from the preview.
 */
export function escapeMarkdownInline(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replaceAll('\\', '\\\\')
    .replaceAll('<', '\\<')
    .replaceAll('>', '\\>');
}

/**
 * Escape user text for a GFM table cell: inline escaping plus the pipe
 * delimiter. Cells are single-line by construction.
 */
export function escapeMarkdownTableCell(text: string): string {
  return escapeMarkdownInline(text).replaceAll('|', '\\|');
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const headerLine = `| ${headers.map(escapeMarkdownTableCell).join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map((row) => `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`);
  return [headerLine, divider, ...rowLines].join('\n');
}

function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${escapeMarkdownInline(item)}`).join('\n');
}

function buildSummarySection(
  facts: ReportFacts,
  locale: SupportedLocale,
  labels: ReportLabels,
): MarkdownSection {
  const { timezone } = facts.schedule;
  return {
    id: 'summary',
    markdown: table(
      [labels.table.field, labels.table.value],
      [
        [labels.fields.mode, labels.modes[facts.mode]],
        [labels.fields.objective, facts.objective],
        [
          labels.fields.plannedTime,
          formatTimeRange(facts.schedule.planned, locale, timezone, labels.missingValue),
        ],
        [
          labels.fields.actualTime,
          formatTimeRange(facts.schedule.actual, locale, timezone, labels.missingValue),
        ],
        [labels.fields.timezone, timezone],
        [labels.fields.attendeeCount, String(facts.attendeeCount)],
        [
          labels.fields.totalPersonHours,
          formatPersonHours(facts.totalPersonMinutes, locale, labels),
        ],
        [
          labels.fields.unallocatedPersonHours,
          formatPersonHours(facts.unallocatedPersonMinutes, locale, labels),
        ],
        [labels.fields.overtime, formatDurationMinutes(facts.overtimeMinutes, locale, labels)],
      ],
    ),
    title: labels.sections.summary,
  };
}

function buildModeFactsSection(
  facts: ReportFacts,
  labels: ReportLabels,
): MarkdownSection | undefined {
  const keys = modeFactKeys[facts.mode];
  const parts: string[] = [];

  for (const key of keys) {
    const values = facts.modeFacts[key] ?? [];
    if (values.length === 0) continue;
    const headings = labels.modeFactHeadings[facts.mode] as Record<string, string>;
    const heading = headings[key] ?? key;
    parts.push(`### ${escapeMarkdownInline(heading)}\n\n${bulletList(values)}`);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return {
    id: 'mode-facts',
    markdown: parts.join('\n\n'),
    title: labels.modeSections[facts.mode],
  };
}

function outcomeCostCell(
  outcome: ReportOutcomeFact,
  locale: SupportedLocale,
  labels: ReportLabels,
): string {
  if (outcome.origin !== 'LIVE' || outcome.formationPersonMinutes === undefined) {
    return labels.missingValue;
  }
  return formatPersonHours(outcome.formationPersonMinutes, locale, labels);
}

function buildOutcomesSection(
  facts: ReportFacts,
  locale: SupportedLocale,
  labels: ReportLabels,
): MarkdownSection {
  if (facts.outcomes.length === 0) {
    return {
      id: 'outcomes',
      markdown: labels.empty.outcomes,
      title: labels.sections.outcomes,
    };
  }

  return {
    id: 'outcomes',
    markdown: table(
      [
        labels.table.outcomeType,
        labels.table.outcomeContent,
        labels.table.owner,
        labels.table.dueDate,
        labels.table.note,
        labels.table.formationCost,
        labels.table.origin,
      ],
      facts.outcomes.map((outcome) => [
        labels.outcomeKinds[outcome.kind],
        outcome.title,
        outcome.owner ?? labels.missingValue,
        outcome.dueDate ?? labels.missingValue,
        outcome.note ?? labels.missingValue,
        outcomeCostCell(outcome, locale, labels),
        outcome.origin === 'POST_MEETING' ? labels.postMeetingTag : labels.missingValue,
      ]),
    ),
    title: labels.sections.outcomes,
  };
}

function buildNextStepsSection(facts: ReportFacts, labels: ReportLabels): MarkdownSection {
  const actions = facts.outcomes.filter((outcome) => outcome.kind === 'ACTION');

  if (actions.length === 0) {
    return {
      id: 'next-steps',
      markdown: labels.empty.nextSteps,
      title: labels.sections.nextSteps,
    };
  }

  const lines = actions.map((action) => {
    const details: string[] = [];
    if (action.owner !== undefined) {
      details.push(`${labels.table.owner}: ${escapeMarkdownInline(action.owner)}`);
    }
    if (action.dueDate !== undefined) {
      details.push(`${labels.table.dueDate}: ${escapeMarkdownInline(action.dueDate)}`);
    }
    if (action.origin === 'POST_MEETING') {
      details.push(labels.postMeetingTag);
    }
    const suffix = details.length === 0 ? '' : ` (${details.join('; ')})`;
    return `- ${escapeMarkdownInline(action.title)}${suffix}`;
  });

  return {
    id: 'next-steps',
    markdown: lines.join('\n'),
    title: labels.sections.nextSteps,
  };
}

function buildPersonTimeSection(
  facts: ReportFacts,
  locale: SupportedLocale,
  labels: ReportLabels,
): MarkdownSection {
  const rows: string[][] = facts.outcomes
    .filter((outcome) => outcome.origin === 'LIVE' && outcome.formationPersonMinutes !== undefined)
    .map((outcome) => [
      outcome.title,
      formatPersonHours(outcome.formationPersonMinutes ?? 0, locale, labels),
    ]);

  rows.push([
    labels.charts.unallocated,
    formatPersonHours(facts.unallocatedPersonMinutes, locale, labels),
  ]);
  rows.push([labels.charts.total, formatPersonHours(facts.totalPersonMinutes, locale, labels)]);

  return {
    id: 'person-time',
    markdown: `${table([labels.table.item, labels.table.personHours], rows)}\n\n${labels.estimateNote}`,
    title: labels.sections.personTime,
  };
}

function buildTimelineSection(
  facts: ReportFacts,
  locale: SupportedLocale,
  labels: ReportLabels,
): MarkdownSection | undefined {
  const startedAt = Date.parse(facts.schedule.actual.start ?? '');
  const liveOutcomes = facts.outcomes.filter(
    (outcome) => outcome.origin === 'LIVE' && outcome.markedAt !== undefined,
  );

  if (!Number.isFinite(startedAt) || liveOutcomes.length === 0) {
    return undefined;
  }

  return {
    id: 'outcome-timeline',
    markdown: table(
      [labels.table.minute, labels.table.time, labels.table.outcomeContent],
      liveOutcomes.map((outcome) => {
        const markedAt = outcome.markedAt ?? '';
        const minute = outcomeMinuteOffset(Date.parse(markedAt), startedAt);
        return [
          String(minute),
          formatDateTime(markedAt, locale, facts.schedule.timezone),
          `${labels.outcomeKinds[outcome.kind]} · ${outcome.title}`,
        ];
      }),
    ),
    title: labels.sections.outcomeTimeline,
  };
}

function buildListSection(
  id: 'parking-lot' | 'unknowns',
  items: readonly string[],
  emptyText: string,
  title: string,
): MarkdownSection {
  return {
    id,
    markdown: items.length === 0 ? emptyText : bulletList(items),
    title,
  };
}

/**
 * Render the deterministic Markdown fallback sections from the same fact
 * base the Mermaid charts use. These sections carry the complete data on
 * their own: when the report model or the Mermaid renderer fails, the report
 * stays readable, copyable, and downloadable (AT-095). Section order is
 * fixed; empty categories render explicit empty states instead of vanishing.
 */
export function renderFallbackTables(
  facts: ReportFacts,
  locale: SupportedLocale,
  options?: FallbackTableOptions,
): MarkdownSection[] {
  const labels = resolveReportLabels(locale, options?.labels);

  return [
    buildSummarySection(facts, locale, labels),
    buildModeFactsSection(facts, labels),
    buildOutcomesSection(facts, locale, labels),
    buildNextStepsSection(facts, labels),
    buildPersonTimeSection(facts, locale, labels),
    buildTimelineSection(facts, locale, labels),
    buildListSection(
      'parking-lot',
      facts.parkingLot,
      labels.empty.parkingLot,
      labels.sections.parkingLot,
    ),
    buildListSection('unknowns', facts.unknowns, labels.empty.unknowns, labels.sections.unknowns),
  ].filter((section) => section !== undefined);
}

/** Minute offset from meeting start, shared by the timeline chart and table. */
export function outcomeMinuteOffset(markedAtMs: number, startedAtMs: number): number {
  return Math.max(0, Math.round((markedAtMs - startedAtMs) / 60_000));
}
