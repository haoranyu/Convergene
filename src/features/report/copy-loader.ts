import type { SupportedLocale } from '@/modules/meeting-domain';
import type { ReportDocumentCopy } from '@/modules/report-domain';

type ReportMessages = { report: { document: ReportDocumentCopy } };

const messageLoaders: Record<SupportedLocale, () => Promise<ReportMessages>> = {
  'en-US': async () => (await import('../../../messages/en-US.json')).default,
  'zh-CN': async () => (await import('../../../messages/zh-CN.json')).default,
  'zh-TW': async () => (await import('../../../messages/zh-TW.json')).default,
};

export async function loadReportDocumentCopy(locale: SupportedLocale): Promise<ReportDocumentCopy> {
  const messages = await messageLoaders[locale]();
  return structuredClone(messages.report.document);
}
