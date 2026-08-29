import type { SupportedLocale } from '@/modules/meeting-domain';

import { assembleReportMarkdown } from './markdown';
import { buildMermaidCharts } from './mermaid';
import { validateReportPolish } from './polish';
import type {
  ReportDocumentCopy,
  ReportFacts,
  ReportGenerationDraft,
  ReportPolishOutput,
} from './types';

export interface ReportPolishRequest {
  input: ReportFacts;
  outputLocale: SupportedLocale;
  requestId: string;
  task: 'report';
}

export interface ReportPolishResponse {
  output: unknown;
  requestId: string;
  task: 'report';
}

export interface ReportPolishTransport {
  (request: ReportPolishRequest, signal?: AbortSignal): Promise<ReportPolishResponse>;
}

export interface GenerateReportDraftInput {
  copy: ReportDocumentCopy;
  facts: ReportFacts;
  locale: SupportedLocale;
  polish?: ReportPolishTransport;
  requestId: string;
  signal?: AbortSignal;
}

export async function generateReportDraft({
  copy,
  facts,
  locale,
  polish,
  requestId,
  signal,
}: GenerateReportDraftInput): Promise<ReportGenerationDraft> {
  signal?.throwIfAborted();
  let polished: ReportPolishOutput | undefined;
  let polishFailure: ReportGenerationDraft['polishFailure'];
  if (polish !== undefined) {
    try {
      const response: unknown = await polish(
        {
          input: structuredClone(facts),
          outputLocale: locale,
          requestId,
          task: 'report',
        },
        signal,
      );
      signal?.throwIfAborted();
      polished =
        typeof response === 'object' &&
        response !== null &&
        'requestId' in response &&
        response.requestId === requestId &&
        'task' in response &&
        response.task === 'report' &&
        'output' in response
          ? validateReportPolish(facts, response.output)
          : undefined;
      if (polished === undefined) polishFailure = 'OUTPUT_INVALID';
    } catch (error) {
      if (signal?.aborted) throw error;
      polishFailure = 'TRANSPORT_FAILED';
    }
  }

  const charts = buildMermaidCharts(facts, locale, copy);
  return {
    charts,
    facts,
    markdown: assembleReportMarkdown(facts, locale, copy, charts, polished),
    polishFailure,
    usedFactDraft: polished === undefined,
  };
}
