import { describe, expect, it, vi } from 'vitest';

import { englishReportDocumentCopy } from '@/fixtures/report-copy';
import { createReportFixture } from '@/fixtures/report';
import type { MeetingReport } from '@/modules/meeting-domain';

import { createMeetingReportCommand, type ReportRepositoryPort } from './commands';

describe('meeting report command', () => {
  it('assembles locally and persists only a complete report for the observed revision', async () => {
    const aggregate = createReportFixture();
    const saveMeetingReport = vi.fn<ReportRepositoryPort['saveMeetingReport']>(
      async (_meetingId, report) => ({
        ok: true,
        value: { ...aggregate.meeting, report },
      }),
    );
    const command = createMeetingReportCommand({ saveMeetingReport }, aggregate, {
      loadCopy: async () => englishReportDocumentCopy,
      now: () => new Date('2026-08-29T11:20:00.000Z'),
      requestId: () => 'report-request-1',
      timezone: 'UTC',
    });

    const result = await command('en-US');

    expect(result.ok).toBe(true);
    expect(saveMeetingReport).toHaveBeenCalledWith(
      aggregate.meeting.id,
      expect.objectContaining({
        locale: 'en-US',
        markdown: expect.stringContaining('## Meeting outcomes'),
        sourceUpdatedAt: aggregate.meeting.updatedAt,
      }),
      aggregate.meeting.updatedAt,
      new Date('2026-08-29T11:20:00.000Z'),
    );
  });

  it('retains the previous successful report when the final save is stale', async () => {
    const previousReport: MeetingReport = {
      generatedAt: '2026-08-29T11:16:00.000Z',
      locale: 'zh-CN',
      markdown: '# 旧报告',
      sourceUpdatedAt: '2026-08-29T11:16:00.000Z',
    };
    const aggregate = createReportFixture();
    aggregate.meeting = { ...aggregate.meeting, report: previousReport };
    const before = structuredClone(aggregate);
    const repository: ReportRepositoryPort = {
      saveMeetingReport: vi.fn().mockResolvedValue({
        error: { code: 'STALE_WRITE' },
        ok: false,
      }),
    };
    const command = createMeetingReportCommand(repository, aggregate, {
      loadCopy: async () => englishReportDocumentCopy,
      now: () => new Date('2026-08-29T11:20:00.000Z'),
      timezone: 'UTC',
    });

    await expect(command('en-US')).resolves.toMatchObject({
      error: { code: 'STALE_WRITE' },
      ok: false,
    });
    expect(aggregate).toEqual(before);
    expect(aggregate.meeting.report).toEqual(previousReport);
  });

  it('persists the fact draft when the optional model transport fails', async () => {
    const aggregate = createReportFixture();
    const saveMeetingReport = vi.fn<ReportRepositoryPort['saveMeetingReport']>(
      async (_meetingId, report) => ({ ok: true, value: { ...aggregate.meeting, report } }),
    );
    const command = createMeetingReportCommand({ saveMeetingReport }, aggregate, {
      loadCopy: async () => englishReportDocumentCopy,
      now: () => new Date('2026-08-29T11:20:00.000Z'),
      polish: () => Promise.reject(new Error('raw provider error')),
      timezone: 'UTC',
    });

    const result = await command('en-US');

    expect(result).toMatchObject({
      ok: true,
      value: { draft: { polishFailure: 'TRANSPORT_FAILED', usedFactDraft: true } },
    });
    expect(saveMeetingReport).toHaveBeenCalledOnce();
  });

  it('regenerates in English without changing Chinese meeting content', async () => {
    const aggregate = createReportFixture({ locale: 'zh-CN' });
    const before = structuredClone(aggregate);
    const saveMeetingReport = vi.fn<ReportRepositoryPort['saveMeetingReport']>(
      async (_meetingId, report) => ({ ok: true, value: { ...aggregate.meeting, report } }),
    );
    const command = createMeetingReportCommand({ saveMeetingReport }, aggregate, {
      loadCopy: async () => englishReportDocumentCopy,
      now: () => new Date('2026-08-29T11:20:00.000Z'),
      timezone: 'UTC',
    });

    const result = await command('en-US');

    expect(result).toMatchObject({ ok: true, value: { report: { locale: 'en-US' } } });
    expect(aggregate).toEqual(before);
    expect(aggregate.meeting.contentLocale).toBe('zh-CN');
    expect(aggregate.nodes).toEqual(before.nodes);
  });
});
