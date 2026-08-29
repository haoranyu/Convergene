import type { SupportedLocale } from '@/modules/meeting-domain';

import { escapeMarkdown, formatTemplate, markdownTable } from './format';
import { reportModeFactKeys } from './types';
import type { MermaidChart, ReportDocumentCopy, ReportFacts, ReportPolishOutput } from './types';

function list(values: readonly string[], empty: string): string {
  return values.length === 0
    ? escapeMarkdown(empty)
    : values.map((value) => `- ${escapeMarkdown(value)}`).join('\n');
}

function formatRange(
  range: ReportFacts['schedule']['actual'],
  locale: SupportedLocale,
  timeZone: string,
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
  return `${formatter.format(new Date(range.startAt))} – ${formatter.format(new Date(range.endAt))}`;
}

function formatHours(personMinutes: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(personMinutes / 60);
}

function formatDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function outcomeTable(
  facts: ReportFacts,
  copy: ReportDocumentCopy,
  locale: SupportedLocale,
): string {
  return markdownTable(
    [
      copy.labels.kind,
      copy.labels.title,
      copy.labels.origin,
      copy.estimatedFormationEffort,
      copy.labels.owner,
      copy.labels.dueDate,
      copy.labels.note,
    ],
    facts.outcomes.map((outcome) => [
      copy.outcomeKinds[outcome.kind],
      outcome.title,
      outcome.origin === 'LIVE' ? copy.origin.live : copy.origin.postMeeting,
      outcome.formationPersonMinutes === undefined
        ? copy.notSet
        : formatHours(outcome.formationPersonMinutes, locale),
      outcome.owner?.trim() || copy.notSet,
      outcome.dueDate?.trim() ? formatDate(outcome.dueDate, locale) : copy.notSet,
      outcome.note?.trim() || copy.notSet,
    ]),
  );
}

function polishByHeading(polish: ReportPolishOutput | undefined) {
  return new Map(polish?.modeSections.map((section) => [section.headingKey, section]) ?? []);
}

export function assembleReportMarkdown(
  facts: ReportFacts,
  locale: SupportedLocale,
  copy: ReportDocumentCopy,
  charts: readonly MermaidChart[],
  polish?: ReportPolishOutput,
): string {
  const lines: string[] = [
    `# ${escapeMarkdown(copy.reportTitle)}: ${escapeMarkdown(facts.title)}`,
    '',
    `## ${escapeMarkdown(copy.headings.executiveSummary)}`,
    '',
    escapeMarkdown(
      polish?.executiveSummary ||
        (facts.outcomes.length === 0
          ? copy.noFormalOutcomesSummary
          : formatTemplate(
              copy.factDraftSummary[
                new Intl.PluralRules(locale).select(facts.outcomes.length) === 'one'
                  ? 'one'
                  : 'other'
              ],
              {
                count: facts.outcomes.length,
                mode: copy.modes[facts.mode],
              },
            )),
    ),
    '',
    `## ${escapeMarkdown(copy.headings.meetingFacts)}`,
    '',
    `- **${escapeMarkdown(copy.labels.objective)}:** ${escapeMarkdown(facts.objective)}`,
    `- **${escapeMarkdown(copy.labels.mode)}:** ${escapeMarkdown(copy.modes[facts.mode])}`,
    `- **${escapeMarkdown(copy.labels.plannedTime)}:** ${escapeMarkdown(
      formatRange(facts.schedule.planned, locale, facts.schedule.timezone),
    )}`,
    `- **${escapeMarkdown(copy.labels.actualTime)}:** ${escapeMarkdown(
      formatRange(facts.schedule.actual, locale, facts.schedule.timezone),
    )}`,
    `- **${escapeMarkdown(copy.labels.timezone)}:** ${escapeMarkdown(facts.schedule.timezone)}`,
    `- **${escapeMarkdown(copy.labels.attendees)}:** ${new Intl.NumberFormat(locale).format(
      facts.attendeeCount,
    )}`,
    `- **${escapeMarkdown(copy.labels.totalPersonHours)}:** ${formatHours(
      facts.totalPersonMinutes,
      locale,
    )}`,
    `- **${escapeMarkdown(copy.labels.unallocatedPersonHours)}:** ${formatHours(
      facts.unallocatedPersonMinutes,
      locale,
    )}`,
    `- **${escapeMarkdown(copy.labels.overtime)}:** ${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(facts.overtimeMinutes)}`,
    `- **${escapeMarkdown(copy.labels.reportLocale)}:** ${locale}`,
    '',
  ];

  const polishedSections = polishByHeading(polish);
  const modeKeys = reportModeFactKeys[facts.mode];
  if (modeKeys.length > 0) {
    lines.push(`## ${escapeMarkdown(copy.headings.modeDetails)}`, '');
  }
  for (const key of modeKeys) {
    const section = polishedSections.get(key);
    lines.push(`### ${escapeMarkdown(copy.modeFacts[key])}`, '');
    if (section !== undefined) {
      lines.push(...section.paragraphs.map((paragraph) => escapeMarkdown(paragraph)), '');
      lines.push(...section.bullets.map((bullet) => `- ${escapeMarkdown(bullet)}`));
      if (section.bullets.length > 0) lines.push('');
    }
    lines.push(list(facts.modeFacts[key], copy.empty.modeFact), '');
  }

  lines.push(`## ${escapeMarkdown(copy.headings.outcomes)}`, '');
  lines.push(
    facts.outcomes.length === 0
      ? escapeMarkdown(copy.empty.outcomes)
      : outcomeTable(facts, copy, locale),
    '',
    `## ${escapeMarkdown(copy.headings.parkingLot)}`,
    '',
    list(facts.parkingLot, copy.empty.parkingLot),
    '',
    `## ${escapeMarkdown(copy.headings.unresolved)}`,
    '',
    list(facts.unknowns, copy.empty.unknowns),
    '',
    `## ${escapeMarkdown(copy.headings.nextSteps)}`,
    '',
  );
  if (polish?.closingSummary) lines.push(escapeMarkdown(polish.closingSummary), '');
  lines.push(
    list(
      facts.outcomes.filter((outcome) => outcome.kind === 'ACTION').map((outcome) => outcome.title),
      copy.empty.nextSteps,
    ),
  );

  if (charts.length > 0) {
    lines.push('', `## ${escapeMarkdown(copy.headings.diagrams)}`, '');
    for (const chart of charts) {
      lines.push(
        `### ${escapeMarkdown(chart.title)}`,
        '',
        '```mermaid',
        chart.definition,
        '```',
        '',
        `#### ${escapeMarkdown(copy.chartData)}`,
        '',
        chart.fallbackMarkdown,
        '',
      );
    }
  }

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
