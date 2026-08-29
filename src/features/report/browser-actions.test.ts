/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';

import {
  copyReportMarkdown,
  downloadReportMarkdown,
  type ReportDownloadRuntime,
} from './browser-actions';

describe('report browser actions', () => {
  it('copies the complete Markdown document', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await copyReportMarkdown('# Report\n\nFull body', { writeText });

    expect(writeText).toHaveBeenCalledWith('# Report\n\nFull body');
  });

  it('downloads the complete Markdown with a non-sensitive deterministic filename', () => {
    const blob = new Blob(['# Report']);
    const runtime: ReportDownloadRuntime = {
      createBlob: vi.fn().mockReturnValue(blob),
      createObjectUrl: vi.fn().mockReturnValue('blob:report'),
      revokeObjectUrl: vi.fn(),
      triggerDownload: vi.fn(),
    };

    downloadReportMarkdown('# Report\n\nFull body', new Date('2026-08-29T23:59:00.000Z'), runtime);

    expect(runtime.createBlob).toHaveBeenCalledWith('# Report\n\nFull body');
    expect(runtime.triggerDownload).toHaveBeenCalledWith(
      'blob:report',
      'convergene-report-2026-08-29.md',
    );
    expect(runtime.revokeObjectUrl).toHaveBeenCalledWith('blob:report');
  });
});
