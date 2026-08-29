export interface ReportDownloadRuntime {
  createBlob(markdown: string): Blob;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  triggerDownload(url: string, filename: string): void;
}

function defaultDownloadRuntime(): ReportDownloadRuntime {
  return {
    createBlob: (markdown) => new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    triggerDownload: (url, filename) => {
      const anchor = document.createElement('a');
      anchor.download = filename;
      anchor.href = url;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
  };
}

export async function copyReportMarkdown(
  markdown: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = globalThis.navigator?.clipboard,
): Promise<void> {
  if (clipboard === undefined) throw new Error('Clipboard unavailable');
  await clipboard.writeText(markdown);
}

export function downloadReportMarkdown(
  markdown: string,
  now = new Date(),
  runtime = defaultDownloadRuntime(),
): void {
  const filename = `convergene-report-${now.toISOString().slice(0, 10)}.md`;
  const blob = runtime.createBlob(markdown);
  const url = runtime.createObjectUrl(blob);
  try {
    runtime.triggerDownload(url, filename);
  } finally {
    runtime.revokeObjectUrl(url);
  }
}
