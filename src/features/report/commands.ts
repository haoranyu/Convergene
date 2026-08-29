import type { MeetingAggregate } from '@/modules/meeting-db';
import type { MeetingRepository, MeetingRepositoryErrorCode } from '@/modules/meeting-db';
import type { Meeting, MeetingReport, SupportedLocale } from '@/modules/meeting-domain';
import {
  buildReportFacts,
  generateReportDraft,
  type ReportDocumentCopy,
  type ReportGenerationDraft,
  type ReportPolishTransport,
} from '@/modules/report-domain';
import type { Result } from '@/modules/shared';

import { loadReportDocumentCopy } from './copy-loader';

export interface ReportRepositoryPort {
  saveMeetingReport(
    meetingId: string,
    report: MeetingReport,
    expectedMeetingUpdatedAt: string,
    now: Date,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>>;
}

type MeetingRepositoryCompatibility = MeetingRepository extends ReportRepositoryPort ? true : never;
const meetingRepositoryCompatibility: MeetingRepositoryCompatibility = true;
void meetingRepositoryCompatibility;

export interface GeneratedMeetingReport {
  draft: ReportGenerationDraft;
  meeting: Meeting;
  report: MeetingReport;
}

export interface GenerateMeetingReportCommand {
  (
    locale: SupportedLocale,
    signal?: AbortSignal,
  ): Promise<Result<GeneratedMeetingReport, MeetingRepositoryErrorCode>>;
}

export interface ReportCommandOptions {
  loadCopy?: (locale: SupportedLocale) => Promise<ReportDocumentCopy>;
  now?: () => Date;
  polish?: ReportPolishTransport;
  requestId?: () => string;
  timezone: string;
}

/**
 * Binds report generation to one observed aggregate revision. Nothing is
 * persisted until the complete localized Markdown has been assembled.
 */
export function createMeetingReportCommand(
  repository: ReportRepositoryPort,
  aggregate: MeetingAggregate,
  {
    loadCopy = loadReportDocumentCopy,
    now = () => new Date(),
    polish,
    requestId = () => crypto.randomUUID(),
    timezone,
  }: ReportCommandOptions,
): GenerateMeetingReportCommand {
  const snapshot = structuredClone(aggregate);

  return async (locale, signal) => {
    const facts = buildReportFacts(snapshot, timezone);
    if (!facts.ok) return facts;
    const copy = await loadCopy(locale);
    const generatedAt = now();
    const draft = await generateReportDraft({
      copy,
      facts: facts.value,
      locale,
      polish,
      requestId: requestId(),
      signal,
    });
    const report: MeetingReport = {
      generatedAt: generatedAt.toISOString(),
      locale,
      markdown: draft.markdown,
      sourceUpdatedAt: snapshot.meeting.updatedAt,
    };
    const saved = await repository.saveMeetingReport(
      snapshot.meeting.id,
      report,
      snapshot.meeting.updatedAt,
      generatedAt,
    );
    if (!saved.ok) return saved;
    if (saved.value.report === undefined) {
      return { error: { code: 'INVALID_MEETING' }, ok: false };
    }
    return {
      ok: true,
      value: { draft, meeting: saved.value, report: saved.value.report },
    };
  };
}
