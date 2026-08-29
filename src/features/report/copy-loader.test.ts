import { describe, expect, it } from 'vitest';

import { createReportFixture } from '@/fixtures/report';
import type { SupportedLocale } from '@/modules/meeting-domain';
import { buildReportFacts, generateReportDraft } from '@/modules/report-domain';

import { loadReportDocumentCopy } from './copy-loader';

const localeExpectations: Array<{
  heading: string;
  locale: SupportedLocale;
  reportTitle: string;
}> = [
  { heading: '## 会议事实', locale: 'zh-CN', reportTitle: '# 会议报告' },
  { heading: '## 會議事實', locale: 'zh-TW', reportTitle: '# 會議報告' },
  { heading: '## Meeting facts', locale: 'en-US', reportTitle: '# Meeting report' },
];

describe('localized report documents', () => {
  it.each(localeExpectations)(
    'assembles Markdown and Mermaid table labels for $locale',
    async ({ heading, locale, reportTitle }) => {
      const facts = buildReportFacts(createReportFixture({ locale }), 'Asia/Singapore');
      expect(facts.ok).toBe(true);
      if (!facts.ok) return;

      const result = await generateReportDraft({
        copy: await loadReportDocumentCopy(locale),
        facts: facts.value,
        locale,
        requestId: `report-${locale}`,
      });

      expect(result.markdown).toContain(reportTitle);
      expect(result.markdown).toContain(heading);
      expect(result.markdown).toContain('```mermaid');
      expect(result.charts.every((chart) => result.markdown.includes(chart.fallbackMarkdown))).toBe(
        true,
      );
    },
  );
});
