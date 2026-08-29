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
      output: {
        closingSummary: 'Agree on criteria',
        executiveSummary: 'Choose the launch plan',
        modeSections: [],
      },
      requestId: 'request-1',
      task: 'report',
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
    expect(result.markdown).toContain('## Executive summary\n\nChoose the launch plan');
  });

  it('rejects a stale response whose request id does not match the pending report', async () => {
    const facts = buildReportFacts(createReportFixture(), 'UTC');
    expect(facts.ok).toBe(true);
    if (!facts.ok) return;

    const result = await generateReportDraft({
      copy: englishReportDocumentCopy,
      facts: facts.value,
      locale: 'en-US',
      polish: () =>
        Promise.resolve({
          output: {
            closingSummary: '',
            executiveSummary: 'Compare options is the recorded decision.',
            modeSections: [],
          },
          requestId: 'older-request',
          task: 'report',
        }),
      requestId: 'pending-request',
    });

    expect(result).toMatchObject({ polishFailure: 'OUTPUT_INVALID', usedFactDraft: true });
    expect(result.markdown).not.toContain('Compare options is the recorded decision.');
  });

  it('uses the fact draft when the transport returns a malformed response envelope', async () => {
    const facts = buildReportFacts(createReportFixture(), 'UTC');
    expect(facts.ok).toBe(true);
    if (!facts.ok) return;

    const result = await generateReportDraft({
      copy: englishReportDocumentCopy,
      facts: facts.value,
      locale: 'en-US',
      polish: () => Promise.resolve(null as never),
      requestId: 'request-malformed',
    });

    expect(result).toMatchObject({ polishFailure: 'OUTPUT_INVALID', usedFactDraft: true });
  });

  it('propagates cancellation even when a transport resolves after abort', async () => {
    const facts = buildReportFacts(createReportFixture(), 'UTC');
    expect(facts.ok).toBe(true);
    if (!facts.ok) return;
    const controller = new AbortController();

    await expect(
      generateReportDraft({
        copy: englishReportDocumentCopy,
        facts: facts.value,
        locale: 'en-US',
        polish: async () => {
          controller.abort();
          return {
            output: {
              closingSummary: '',
              executiveSummary: facts.value.objective,
              modeSections: [],
            },
            requestId: 'request-cancelled',
            task: 'report',
          };
        },
        requestId: 'request-cancelled',
        signal: controller.signal,
      }),
    ).rejects.toHaveProperty('name', 'AbortError');
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
