export { buildReportFacts } from './facts';
export { generateReportDraft } from './generation';
export type {
  GenerateReportDraftInput,
  ReportPolishRequest,
  ReportPolishTransport,
} from './generation';
export { assembleReportMarkdown } from './markdown';
export { buildMermaidCharts, escapeMermaidLabel } from './mermaid';
export { renderStrictMermaid, strictMermaidConfiguration } from './mermaid-renderer';
export type { MermaidRenderer, MermaidRenderResult } from './mermaid-renderer';
export { reportPolishOutputSchema, validateReportPolish } from './polish';
export { reportModeFactKeys } from './types';
export type {
  MermaidChart,
  ReportDocumentCopy,
  ReportFacts,
  ReportGenerationDraft,
  ReportModeFactKey,
  ReportOutcomeFact,
  ReportPolishOutput,
  ReportPolishSection,
  ReportTimeRange,
} from './types';
