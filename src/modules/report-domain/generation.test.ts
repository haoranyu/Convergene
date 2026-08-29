import { describe, expect, it, vi } from 'vitest';

import { englishReportDocumentCopy } from '@/fixtures/report-copy';
import { createReportFixture } from '@/fixtures/report';

import { buildReportFacts } from './facts';
import { generateReportDraft } from './generation';

describe('report generation', () => {
  it('sends only structured facts through the polish seam', async () => {
    const aggregate = createReportFixture();
    const facts = buildReportFacts(aggregate, 'UTC');
    expect(facts.ok).toBe(true);
    if (!facts.ok) return;
    const polish = vi.fn().mockResolvedValue({
      closingSummary: 'Agree on criteria is the recorded next step.',
      executiveSummary: 'Compare options is the recorded decision.',
      modeSections: [],
    });

    const result = await generateReportDraft({
      copy: englishReportDocumentCopy,
      facts: facts.value,
      locale: 'en-US',
      polish,
      requestId: 'request-1',
    });

    expect(polish).toHaveBeenCalledWith(
      {
        input: facts.value,
        outputLocale: 'en-US',
        requestId: 'request-1',
        task: 'report',
      },
      undefined,
    );
    expect(JSON.stringify(polish.mock.calls[0])).not.toContain(aggregate.meeting.id);
    expect(result.usedFactDraft).toBe(false);
    expect(result.markdown).toContain('Compare options is the recorded decision.');
  });

  it('keeps a complete deterministic Markdown report when polishing fails', async () => {
    const facts = buildReportFacts(createReportFixture(), 'UTC');
    expect(facts.ok).toBe(true);
    if (!facts.ok) return;

    const result = await generateReportDraft({
      copy: englishReportDocumentCopy,
      facts: facts.value,
      locale: 'en-US',
      polish: () => Promise.reject(new Error('provider body must stay hidden')),
      requestId: 'request-2',
    });

    expect(result).toMatchObject({
      polishFailure: 'TRANSPORT_FAILED',
      usedFactDraft: true,
    });
    expect(result.markdown).toContain('## Meeting facts');
    expect(result.markdown).toContain('## Meeting outcomes');
    expect(result.markdown).toContain('```mermaid');
    expect(result.markdown).not.toContain('provider body');
  });

  it('generates another locale without mutating the meeting content locale', async () => {
    const aggregate = createReportFixture({ locale: 'zh-CN' });
    const before = structuredClone(aggregate);
    const facts = buildReportFacts(aggregate, 'Asia/Shanghai');
    expect(facts.ok).toBe(true);
    if (!facts.ok) return;

    const result = await generateReportDraft({
      copy: englishReportDocumentCopy,
      facts: facts.value,
      locale: 'en-US',
      requestId: 'request-3',
    });

    expect(result.markdown).toContain('Report language:** en-US');
    expect(aggregate).toEqual(before);
    expect(aggregate.meeting.contentLocale).toBe('zh-CN');
  });
});
