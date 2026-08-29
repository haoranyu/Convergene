import type { SupportedLocale } from '@/modules/meeting-domain';

import { markdownTable, truncateGraphemes } from './format';
import {
  reportModeFactKeys,
  type MermaidChart,
  type ReportDocumentCopy,
  type ReportFacts,
} from './types';

const maximumChartItems = 8;
const maximumLabelGraphemes = 80;

/** Prevents user text from terminating a quoted Mermaid label or adding syntax. */
export function escapeMermaidLabel(value: string): string {
  return truncateGraphemes(value.replace(/\r?\n/g, ' '), maximumLabelGraphemes)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('[', '&#91;')
    .replaceAll(']', '&#93;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    .replaceAll('(', '&#40;')
    .replaceAll(')', '&#41;')
    .replaceAll(':', '&#58;')
    .replaceAll('`', '&#96;');
}

function narrativeChart(facts: ReportFacts, copy: ReportDocumentCopy): MermaidChart | undefined {
  const items = [
    ...new Set(reportModeFactKeys[facts.mode].flatMap((key) => facts.modeFacts[key])),
  ].slice(0, maximumChartItems);
  if (items.length === 0) return undefined;

  const definition = [
    'flowchart LR',
    `  objective["${escapeMermaidLabel(facts.objective)}"]`,
    ...items.flatMap((item, index) => [
      `  fact${index}["${escapeMermaidLabel(item)}"]`,
      `  objective --> fact${index}`,
    ]),
  ].join('\n');

  return {
    definition,
    fallbackMarkdown: markdownTable(
      [copy.charts.from, copy.charts.to],
      items.map((item) => [facts.objective, item]),
    ),
    id: 'mode-narrative',
    title: copy.charts.narrative,
    type: 'MODE_NARRATIVE',
  };
}

function timelineChart(
  facts: ReportFacts,
  locale: SupportedLocale,
  copy: ReportDocumentCopy,
): MermaidChart | undefined {
  const start = Date.parse(facts.schedule.actual.startAt);
  const outcomes = facts.outcomes
    .filter((outcome) => outcome.origin === 'LIVE' && outcome.markedAt !== undefined)
    .slice(0, maximumChartItems);
  if (outcomes.length === 0) return undefined;

  const rows = outcomes.map((outcome) => {
    const minute = Math.max(0, Math.round((Date.parse(outcome.markedAt!) - start) / 60_000));
    return {
      label: `${copy.charts.minute} ${minute}`,
      minute,
      outcome,
    };
  });
  return {
    definition: [
      'timeline',
      `  title ${escapeMermaidLabel(copy.charts.timeline)}`,
      `  ${escapeMermaidLabel(copy.charts.start)} : ${escapeMermaidLabel(facts.objective)}`,
      ...rows.map(
        ({ label, outcome }) =>
          `  ${escapeMermaidLabel(label)} : ${escapeMermaidLabel(outcome.title)}`,
      ),
    ].join('\n'),
    fallbackMarkdown: markdownTable(
      [copy.charts.minute, copy.charts.outcome, copy.estimatedFormationEffort],
      rows.map(({ minute, outcome }) => [
        new Intl.NumberFormat(locale).format(minute),
        outcome.title,
        new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
          (outcome.formationPersonMinutes ?? 0) / 60,
        ),
      ]),
    ),
    id: 'outcome-timeline',
    title: copy.charts.timeline,
    type: 'OUTCOME_TIMELINE',
  };
}

function allocationChart(
  facts: ReportFacts,
  locale: SupportedLocale,
  copy: ReportDocumentCopy,
): MermaidChart | undefined {
  if (facts.totalPersonMinutes <= 0) return undefined;
  const formation = Math.max(0, facts.totalPersonMinutes - facts.unallocatedPersonMinutes);
  const slices = [
    { label: copy.charts.formation, value: formation },
    { label: copy.charts.unallocated, value: facts.unallocatedPersonMinutes },
  ].filter((slice) => slice.value > 0);

  return {
    definition: [
      'pie showData',
      `  title ${escapeMermaidLabel(copy.charts.allocation)}`,
      ...slices.map(
        (slice) =>
          `  "${escapeMermaidLabel(slice.label)}" : ${Math.round(slice.value * 1000) / 1000}`,
      ),
    ].join('\n'),
    fallbackMarkdown: markdownTable(
      [copy.charts.allocation, copy.charts.personMinutes],
      slices.map((slice) => [slice.label, new Intl.NumberFormat(locale).format(slice.value)]),
    ),
    id: 'person-time-allocation',
    title: copy.charts.allocation,
    type: 'ALLOCATION',
  };
}

/** Generates at most three charts from structured facts; no model text is accepted here. */
export function buildMermaidCharts(
  facts: ReportFacts,
  locale: SupportedLocale,
  copy: ReportDocumentCopy,
): MermaidChart[] {
  return [
    narrativeChart(facts, copy),
    timelineChart(facts, locale, copy),
    allocationChart(facts, locale, copy),
  ]
    .filter((chart): chart is MermaidChart => chart !== undefined)
    .slice(0, 3);
}
