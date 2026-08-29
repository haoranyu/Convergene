export { buildFactDraft, toReportAIFacts } from './fact-draft';
export type { FactDraftContext } from './fact-draft';
export {
  defaultReportLabels,
  formatDateTime,
  formatDurationMinutes,
  formatPersonHours,
  formatTimeRange,
  interpolate,
  resolveReportLabels,
} from './localization';
export type { ModeFactHeadings, ReportLabelOverrides, ReportLabels } from './localization';
export {
  buildMermaidCharts,
  escapeMermaidLabel,
  escapeMermaidTimelineText,
  truncateGraphemes,
} from './mermaid';
export type { MermaidChartOptions } from './mermaid';
export {
  escapeMarkdownInline,
  escapeMarkdownTableCell,
  outcomeMinuteOffset,
  renderFallbackTables,
} from './fallback-tables';
export type { FallbackTableOptions } from './fallback-tables';
export { modeFactKeys, reportMermaidLimits } from './model';
export type {
  MarkdownSection,
  MermaidChart,
  MermaidChartId,
  MermaidDiagramType,
  ReportAIFacts,
  ReportAIOutcomeFact,
  ReportDomainErrorCode,
  ReportFacts,
  ReportOutcomeFact,
  ReportSchedule,
  ReportSectionId,
  ReportTimeRange,
  ReportTreeNode,
} from './model';
