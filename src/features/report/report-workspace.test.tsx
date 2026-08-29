// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import enUS from '../../../messages/en-US.json';
import { createReportFixture } from '@/fixtures/report';
import type { MeetingAggregate } from '@/modules/meeting-db';
import type { MeetingReport } from '@/modules/meeting-domain';
import { buildReportFacts } from '@/modules/report-domain';

import type { GeneratedMeetingReport } from './commands';
import { ReportMarkdown } from './report-markdown';
import { ReportWorkspaceView as ReportWorkspace } from './report-workspace';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
    writable: true,
  });
});

afterEach(cleanup);

function renderEnglish(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

function withReport(aggregate: MeetingAggregate, markdown = '# Previous report'): MeetingAggregate {
  const report: MeetingReport = {
    generatedAt: aggregate.meeting.updatedAt,
    locale: 'en-US',
    markdown,
    sourceUpdatedAt: aggregate.meeting.updatedAt,
  };
  return {
    ...aggregate,
    meeting: { ...aggregate.meeting, report },
  };
}

function generatedReport(
  aggregate: MeetingAggregate,
  markdown: string,
  usedFactDraft = false,
): GeneratedMeetingReport {
  const revision = '2026-08-29T11:30:00.000Z';
  const report: MeetingReport = {
    generatedAt: revision,
    locale: 'en-US',
    markdown,
    sourceUpdatedAt: revision,
  };
  const facts = buildReportFacts(aggregate, 'UTC');
  if (!facts.ok) throw new Error('fixture must produce report facts');
  return {
    draft: {
      charts: [],
      facts: facts.value,
      markdown,
      usedFactDraft,
    },
    meeting: { ...aggregate.meeting, report, updatedAt: revision },
    report,
  };
}

describe('report workspace', () => {
  it('gives an honest retry path when first generation fails', async () => {
    const user = userEvent.setup();
    renderEnglish(
      <ReportWorkspace
        aggregate={createReportFixture()}
        onGenerate={vi.fn().mockResolvedValue({
          error: { code: 'STALE_WRITE' },
          ok: false,
        })}
        timezone="UTC"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Generate report' }));

    expect(
      await screen.findByText(
        'The report could not be saved. Meeting facts are unchanged; try generating it again.',
      ),
    ).toBeVisible();
  });

  it('keeps the previous report visible while regeneration fails', async () => {
    const aggregate = withReport(createReportFixture());
    let finish: ((value: { error: { code: 'STALE_WRITE' }; ok: false }) => void) | undefined;
    const onGenerate = vi.fn(
      () =>
        new Promise<{ error: { code: 'STALE_WRITE' }; ok: false }>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    renderEnglish(<ReportWorkspace aggregate={aggregate} onGenerate={onGenerate} timezone="UTC" />);

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(screen.getByRole('heading', { name: 'Previous report' })).toBeVisible();
    expect(screen.getByText('Generating the new report')).toBeVisible();

    finish?.({ error: { code: 'STALE_WRITE' }, ok: false });
    await waitFor(() =>
      expect(
        screen.getByText(
          'The new report could not be saved. The previous report is still available.',
        ),
      ).toBeVisible(),
    );
    expect(screen.getByRole('heading', { name: 'Previous report' })).toBeVisible();
  });

  it('replaces the preview only after a complete report is saved', async () => {
    const aggregate = withReport(createReportFixture());
    const complete = generatedReport(aggregate, '# Current report\n\nComplete body');
    const onGenerate = vi.fn().mockResolvedValue({ ok: true, value: complete });
    const user = userEvent.setup();
    renderEnglish(<ReportWorkspace aggregate={aggregate} onGenerate={onGenerate} timezone="UTC" />);

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(await screen.findByRole('heading', { name: 'Current report' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Previous report' })).not.toBeInTheDocument();
    expect(screen.getByText('The new report was saved locally.')).toBeVisible();
  });

  it('uses the observed aggregate revision to flag a locally generated report as stale', async () => {
    const aggregate = withReport(createReportFixture());
    const complete = generatedReport(aggregate, '# Current report');
    const onGenerate = vi.fn().mockResolvedValue({ ok: true, value: complete });
    const user = userEvent.setup();
    const view = renderEnglish(
      <ReportWorkspace aggregate={aggregate} onGenerate={onGenerate} timezone="UTC" />,
    );
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await screen.findByRole('heading', { name: 'Current report' });

    const changedAggregate = {
      ...aggregate,
      meeting: {
        ...complete.meeting,
        updatedAt: '2026-08-29T11:31:00.000Z',
      },
    };
    view.rerender(
      <NextIntlClientProvider locale="en-US" messages={enUS} timeZone="UTC">
        <ReportWorkspace aggregate={changedAggregate} onGenerate={onGenerate} timezone="UTC" />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByText('Meeting facts changed after this report. Regenerate to update it.'),
    ).toBeVisible();
  });

  it('explains deterministic fallback and exports the exact stored Markdown', async () => {
    const aggregate = createReportFixture();
    const complete = generatedReport(aggregate, '# Fact draft\n\nNo model facts invented.', true);
    const onGenerate = vi.fn().mockResolvedValue({ ok: true, value: complete });
    const copyMarkdown = vi.fn().mockResolvedValue(undefined);
    const downloadMarkdown = vi.fn();
    const user = userEvent.setup();
    renderEnglish(
      <ReportWorkspace
        aggregate={aggregate}
        copyMarkdown={copyMarkdown}
        downloadMarkdown={downloadMarkdown}
        onGenerate={onGenerate}
        timezone="UTC"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Generate report' }));
    expect(
      await screen.findByText(
        'Model wording was unavailable, so the deterministic fact draft was saved.',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Copy Markdown' }));
    await user.click(screen.getByRole('button', { name: 'Download .md' }));

    expect(copyMarkdown).toHaveBeenCalledWith(complete.report.markdown);
    expect(downloadMarkdown).toHaveBeenCalledWith(complete.report.markdown);
  });

  it('keeps report controls available at a 375px viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    renderEnglish(
      <ReportWorkspace
        aggregate={withReport(createReportFixture())}
        onGenerate={vi.fn()}
        timezone="UTC"
      />,
    );

    const workspace = screen.getByRole('region', { name: /Meeting report/i });
    expect(within(workspace).getByRole('button', { name: 'Regenerate' })).toBeVisible();
    expect(within(workspace).getByRole('button', { name: 'Copy Markdown' })).toBeVisible();
    expect(within(workspace).getByRole('button', { name: 'Download .md' })).toBeVisible();
  });
});

describe('report Markdown resilience', () => {
  it('shows Mermaid source while preserving the same-data table on render failure', async () => {
    const renderMermaid = vi.fn().mockResolvedValue({
      definition: 'flowchart LR\n  a --> b',
      errorCode: 'MERMAID_RENDER_FAILED',
      fallbackMarkdown: '',
      ok: false,
    });
    renderEnglish(
      <ReportMarkdown
        markdown={`# Report

\`\`\`mermaid
flowchart LR
  a --> b
\`\`\`

| From | To |
| --- | --- |
| Objective | Outcome |`}
        renderMermaid={renderMermaid}
      />,
    );

    expect(
      await screen.findByText(
        'This diagram could not be rendered. Its source and the same data table remain available.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Markdown source')).toHaveTextContent('flowchart LR');
    expect(screen.getByRole('table')).toHaveTextContent('Objective');
    expect(screen.getByRole('region', { name: 'Scrollable report data table' })).toBeVisible();
  });

  it('does not render raw HTML embedded in Markdown', () => {
    renderEnglish(
      <ReportMarkdown
        markdown={'# Safe\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))'}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Safe' })).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.queryByText('alert(1)')).not.toBeInTheDocument();
    expect(screen.getByText('unsafe').closest('a')).toBeNull();
  });
});
