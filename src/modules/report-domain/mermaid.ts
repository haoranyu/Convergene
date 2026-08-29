import type { SupportedLocale } from '@/modules/meeting-domain';

import { outcomeMinuteOffset } from './fallback-tables';
import { interpolate, resolveReportLabels } from './localization';
import type { ReportLabelOverrides, ReportLabels } from './localization';
import { reportMermaidLimits } from './model';
import type { MermaidChart, ReportFacts, ReportTreeNode } from './model';

export interface MermaidChartOptions {
  labels?: ReportLabelOverrides;
}

/** Grapheme-safe truncation so CJK titles and emoji never split mid-cluster. */
export function truncateGraphemes(text: string, maxGraphemes: number): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes = [...segmenter.segment(text)].map((part) => part.segment);
  if (graphemes.length <= maxGraphemes) {
    return text;
  }
  return `${graphemes.slice(0, maxGraphemes).join('')}…`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Escape user text for a quoted Mermaid label context (flowchart nodes, pie
 * slices). `#` is escaped first so a literal `#quot;` in user input can never
 * become an entity; quotes and angle brackets then become Mermaid entity
 * codes (raw `<`/`>` breaks flowchart parsing even inside quotes, verified
 * against Mermaid 11.17.2). Truncation runs on the raw text so an escape
 * sequence can never be cut in half.
 */
export function escapeMermaidLabel(text: string): string {
  const truncated = truncateGraphemes(
    normalizeWhitespace(text),
    reportMermaidLimits.maxLabelGraphemes,
  );
  return truncated
    .replaceAll('#', '#35;')
    .replaceAll('"', '#quot;')
    .replaceAll('<', '#60;')
    .replaceAll('>', '#62;');
}

/**
 * Escape user text for a Mermaid timeline event, which has no quoted
 * context: a colon would split one event into two and a semicolon can end
 * the statement, so both are replaced by their fullwidth equivalents. The
 * integration-validation spike showed clock colons break timeline parsing
 * (docs/integration-validation.md §5); this keeps period and event text
 * colon-free by construction.
 */
export function escapeMermaidTimelineText(text: string): string {
  const truncated = truncateGraphemes(
    normalizeWhitespace(text),
    reportMermaidLimits.maxLabelGraphemes,
  );
  return truncated.replaceAll(':', '：').replaceAll(';', '；');
}

function sortSiblings(left: ReportTreeNode, right: ReportTreeNode): number {
  return (
    (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
    Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
    left.nodeId.localeCompare(right.nodeId)
  );
}

function buildModeFlowchart(facts: ReportFacts, labels: ReportLabels): MermaidChart | undefined {
  const tree = facts.discussionTree;
  const root = tree.find((node) => node.parentNodeId === undefined);

  if (root === undefined || tree.length < 2) {
    // Insufficient data: no placeholder diagram.
    return undefined;
  }

  // Depth on the bridged projection tree, for cap prioritization.
  const depthByNodeId = new Map<string, number>([[root.nodeId, 0]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of tree) {
      if (depthByNodeId.has(node.nodeId)) continue;
      const parentDepth =
        node.parentNodeId === undefined ? undefined : depthByNodeId.get(node.parentNodeId);
      if (parentDepth !== undefined) {
        depthByNodeId.set(node.nodeId, parentDepth + 1);
        changed = true;
      }
    }
  }

  // Bounded node budget: outcome-marked and shallow nodes win, overflow is
  // stated explicitly instead of silently dropped.
  const prioritized = [...tree].sort((left, right) => {
    if (left.nodeId === root.nodeId) return -1;
    if (right.nodeId === root.nodeId) return 1;
    if (left.isOutcome !== right.isOutcome) return left.isOutcome ? -1 : 1;
    const depthDelta =
      (depthByNodeId.get(left.nodeId) ?? 0) - (depthByNodeId.get(right.nodeId) ?? 0);
    return depthDelta !== 0 ? depthDelta : sortSiblings(left, right);
  });

  const budget = reportMermaidLimits.maxFlowchartNodes;
  const kept = prioritized.slice(0, budget);
  const overflowCount = prioritized.length - kept.length;
  const keptIds = new Set(kept.map((node) => node.nodeId));

  // Re-bridge: a kept node whose parent was cut links to its nearest kept
  // ancestor (still a true ancestor in the source tree).
  const originalParentByNodeId = new Map(tree.map((node) => [node.nodeId, node.parentNodeId]));
  const finalParentByNodeId = new Map<string, string>();
  for (const node of kept) {
    if (node.nodeId === root.nodeId) continue;
    let ancestorId = node.parentNodeId;
    while (ancestorId !== undefined && !keptIds.has(ancestorId)) {
      ancestorId = originalParentByNodeId.get(ancestorId);
    }
    finalParentByNodeId.set(node.nodeId, ancestorId ?? root.nodeId);
  }

  const childrenByParentId = new Map<string, ReportTreeNode[]>();
  for (const node of kept) {
    const parentId = finalParentByNodeId.get(node.nodeId);
    if (parentId === undefined) continue;
    const siblings = childrenByParentId.get(parentId) ?? [];
    siblings.push(node);
    childrenByParentId.set(parentId, siblings);
  }
  for (const siblings of childrenByParentId.values()) {
    siblings.sort(sortSiblings);
  }

  // Stable synthetic ids in depth-first emission order; user node ids never
  // leak into diagram source.
  const chartIdByNodeId = new Map<string, string>();
  const ordered: ReportTreeNode[] = [];
  const visit = (node: ReportTreeNode): void => {
    chartIdByNodeId.set(node.nodeId, `n${ordered.length + 1}`);
    ordered.push(node);
    for (const child of childrenByParentId.get(node.nodeId) ?? []) {
      visit(child);
    }
  };
  visit(root);

  let overflowNodeId: string | undefined;
  if (overflowCount > 0) {
    overflowNodeId = '__overflow__';
    chartIdByNodeId.set(overflowNodeId, `n${ordered.length + 1}`);
    ordered.push({
      createdAt: '',
      isOutcome: false,
      kind: 'NOTE',
      nodeId: overflowNodeId,
      parentNodeId: root.nodeId,
      title: interpolate(labels.charts.moreItems, { count: String(overflowCount) }),
    });
    finalParentByNodeId.set(overflowNodeId, root.nodeId);
  }

  const lines: string[] = ['flowchart LR'];
  for (const node of ordered) {
    const chartId = chartIdByNodeId.get(node.nodeId) ?? '';
    // Outcome-marked nodes carry a ★ prefix. Do not switch this to a Mermaid
    // shape (e.g. stadium): in Mermaid 11.17.2 non-rect shapes route the
    // label through btoa during edge layout and crash on any non-Latin-1
    // character (CJK, emoji) — rect nodes render arbitrary Unicode safely.
    const label = escapeMermaidLabel(node.isOutcome ? `★ ${node.title}` : node.title);
    lines.push(`    ${chartId}["${label}"]`);
  }
  for (const node of ordered) {
    const parentId = finalParentByNodeId.get(node.nodeId);
    if (parentId === undefined) continue;
    const parentChartId = chartIdByNodeId.get(parentId);
    const childChartId = chartIdByNodeId.get(node.nodeId);
    if (parentChartId === undefined || childChartId === undefined) continue;
    lines.push(`    ${parentChartId} --> ${childChartId}`);
  }

  return {
    diagramType: 'flowchart',
    id: 'mode-flowchart',
    source: lines.join('\n'),
    title: labels.charts.modeFlowchart[facts.mode],
  };
}

function buildOutcomeTimeline(facts: ReportFacts, labels: ReportLabels): MermaidChart | undefined {
  const startedAt = Date.parse(facts.schedule.actual.start ?? '');
  const liveOutcomes = facts.outcomes.filter(
    (outcome) => outcome.origin === 'LIVE' && outcome.markedAt !== undefined,
  );

  if (!Number.isFinite(startedAt) || liveOutcomes.length === 0) {
    return undefined;
  }

  interface TimelineEvent {
    minute: number;
    text: string;
  }

  const anchor: TimelineEvent = { minute: 0, text: labels.charts.meetingStarted };
  const outcomeEvents: TimelineEvent[] = liveOutcomes.map((outcome) => ({
    minute: outcomeMinuteOffset(Date.parse(outcome.markedAt ?? ''), startedAt),
    text: escapeMermaidTimelineText(outcome.title),
  }));

  // Reserve one slot for the anchor; when outcomes exceed the event budget,
  // the tail collapses into one factual overflow event pinned to the first
  // cut minute.
  const capacity = reportMermaidLimits.maxTimelineEvents - 1;
  const events: TimelineEvent[] = [anchor];
  if (outcomeEvents.length <= capacity) {
    events.push(...outcomeEvents);
  } else {
    const firstDropped = outcomeEvents[capacity - 1];
    events.push(...outcomeEvents.slice(0, capacity - 1));
    if (firstDropped !== undefined) {
      events.push({
        minute: firstDropped.minute,
        text: interpolate(labels.charts.moreItems, {
          count: String(outcomeEvents.length - capacity + 1),
        }),
      });
    }
  }

  const eventsByMinute = new Map<number, string[]>();
  for (const event of events) {
    const bucket = eventsByMinute.get(event.minute) ?? [];
    bucket.push(event.text);
    eventsByMinute.set(event.minute, bucket);
  }

  const lines: string[] = ['timeline', `    title ${labels.charts.outcomeTimeline}`];
  for (const minute of [...eventsByMinute.keys()].sort((left, right) => left - right)) {
    const period = interpolate(labels.minutePeriod, { count: String(minute) });
    lines.push(`    ${period} : ${(eventsByMinute.get(minute) ?? []).join(' : ')}`);
  }

  return {
    diagramType: 'timeline',
    id: 'outcome-timeline',
    source: lines.join('\n'),
    title: labels.charts.outcomeTimeline,
  };
}

function roundToHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

interface PieSlice {
  label: string;
  minutes: number;
}

function buildPersonTimePie(facts: ReportFacts, labels: ReportLabels): MermaidChart | undefined {
  const formationSlices: PieSlice[] = facts.outcomes
    .filter((outcome) => outcome.origin === 'LIVE' && outcome.formationPersonMinutes !== undefined)
    .map((outcome) => ({
      label: outcome.title,
      minutes: roundToHundredths(outcome.formationPersonMinutes ?? 0),
    }))
    .filter((slice) => slice.minutes > 0);

  const unallocated = roundToHundredths(facts.unallocatedPersonMinutes);
  const tail: PieSlice[] =
    unallocated > 0 ? [{ label: labels.charts.unallocated, minutes: unallocated }] : [];

  let slices: PieSlice[] = [...formationSlices, ...tail];

  // Bounded slice count: largest outcomes stay, the rest aggregate into one
  // factual "N other items" slice before the unattributed remainder.
  const capacity = reportMermaidLimits.maxPieSlices;
  if (slices.length > capacity) {
    const outcomeCapacity = Math.max(1, capacity - tail.length - 1);
    const ranked = [...formationSlices].sort(
      (left, right) => right.minutes - left.minutes || left.label.localeCompare(right.label),
    );
    const kept = new Set(ranked.slice(0, outcomeCapacity));
    const keptInOrder = formationSlices.filter((slice) => kept.has(slice));
    const dropped = formationSlices.filter((slice) => !kept.has(slice));
    const others: PieSlice = {
      label: interpolate(labels.charts.otherItems, { count: String(dropped.length) }),
      minutes: roundToHundredths(dropped.reduce((sum, slice) => sum + slice.minutes, 0)),
    };
    slices = [...keptInOrder, ...(others.minutes > 0 ? [others] : []), ...tail];
  }

  if (slices.length < 2) {
    // A single-slice pie carries no distribution; the tables state the number.
    return undefined;
  }

  // Mermaid pie merges identical labels, which would silently merge distinct
  // outcomes; disambiguate repeats deterministically.
  const seen = new Map<string, number>();
  const lines: string[] = ['pie showData', `    title ${labels.charts.personTime}`];
  for (const slice of slices) {
    const occurrence = (seen.get(slice.label) ?? 0) + 1;
    seen.set(slice.label, occurrence);
    const label = occurrence === 1 ? slice.label : `${slice.label} (${occurrence})`;
    lines.push(`    "${escapeMermaidLabel(label)}" : ${slice.minutes}`);
  }

  return {
    diagramType: 'pie',
    id: 'person-time',
    source: lines.join('\n'),
    title: labels.charts.personTime,
  };
}

/**
 * Generate at most three deterministic Mermaid charts from the fact base.
 * Charts are selected by meeting mode and data sufficiency; nothing is
 * emitted when the underlying data would make a diagram a placeholder. A
 * failure in one chart omits that chart only — the fact draft and fallback
 * tables are independent of this function by construction.
 */
export function buildMermaidCharts(
  facts: ReportFacts,
  locale: SupportedLocale,
  options?: MermaidChartOptions,
): MermaidChart[] {
  const labels = resolveReportLabels(locale, options?.labels);
  const builders = [buildModeFlowchart, buildOutcomeTimeline, buildPersonTimePie];
  const charts: MermaidChart[] = [];

  for (const builder of builders) {
    try {
      const chart = builder(facts, labels);
      if (chart !== undefined) {
        charts.push(chart);
      }
    } catch {
      // A malformed fact set must never break the report body or other charts.
    }
  }

  return charts.slice(0, reportMermaidLimits.maxCharts);
}
