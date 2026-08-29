import { describe, expect, it } from 'vitest';

import {
  defaultReportLabels,
  formatDateTime,
  formatDurationMinutes,
  formatPersonHours,
  interpolate,
  resolveReportLabels,
} from '@/modules/report-domain';
import type { ReportLabelOverrides } from '@/modules/report-domain';
import type { SupportedLocale } from '@/modules/meeting-domain';

function collectLeafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('defaultReportLabels', () => {
  it('keeps structural parity across all supported locales', () => {
    const reference = collectLeafPaths(defaultReportLabels['zh-CN']).sort();

    for (const locale of ['zh-TW', 'en-US'] as const) {
      expect(collectLeafPaths(defaultReportLabels[locale]).sort()).toEqual(reference);
    }
  });

  it('uses the documented mode and outcome terminology', () => {
    expect(defaultReportLabels['zh-CN'].modes.DECISION).toBe('决策对齐');
    expect(defaultReportLabels['zh-TW'].modes.BRAINSTORM).toBe('腦力激盪');
    expect(defaultReportLabels['en-US'].modes.RETRO).toBe('Retrospective');
    expect(defaultReportLabels['zh-CN'].outcomeKinds.CANDIDATE_IDEA).toBe('候选创意');
    expect(defaultReportLabels['zh-TW'].outcomeKinds.ACTION).toBe('行動項目');
    expect(defaultReportLabels['en-US'].outcomeKinds.INSIGHT).toBe('Insight');
  });
});

describe('resolveReportLabels', () => {
  it('returns the locale dictionary by default', () => {
    expect(resolveReportLabels('zh-CN').sections.summary).toBe('会议概要');
    expect(resolveReportLabels('en-US').sections.summary).toBe('Meeting summary');
  });

  it('falls back to zh-CN for an unknown locale value', () => {
    const labels = resolveReportLabels('fr-FR' as SupportedLocale);

    expect(labels.sections.summary).toBe('会议概要');
  });

  it('replaces whole top-level sections with overrides', () => {
    const overrides: ReportLabelOverrides = {
      empty: {
        nextSteps: 'No actions recorded.',
        outcomes: 'Nothing was marked.',
        parkingLot: 'Parking lot is empty.',
        unknowns: 'Nothing left open.',
      },
    };
    const labels = resolveReportLabels('en-US', overrides);

    expect(labels.empty.outcomes).toBe('Nothing was marked.');
    expect(labels.sections.summary).toBe('Meeting summary');
  });
});

describe('report formatting helpers', () => {
  const labels = defaultReportLabels['en-US'];

  it('formats person-hours from minutes with locale-aware plurals', () => {
    expect(formatPersonHours(60, 'en-US', labels)).toBe('1 person-hour');
    expect(formatPersonHours(90, 'en-US', labels)).toBe('1.5 person-hours');
    expect(formatPersonHours(280, 'en-US', labels)).toBe('4.7 person-hours');
    expect(formatPersonHours(60, 'zh-CN', defaultReportLabels['zh-CN'])).toBe('1 人时');
    expect(formatPersonHours(30, 'zh-TW', defaultReportLabels['zh-TW'])).toBe('0.5 人時');
  });

  it('formats durations in minutes with plurals', () => {
    expect(formatDurationMinutes(1, 'en-US', labels)).toBe('1 minute');
    expect(formatDurationMinutes(10, 'en-US', labels)).toBe('10 minutes');
    expect(formatDurationMinutes(0, 'en-US', labels)).toBe('0 minutes');
    expect(formatDurationMinutes(10, 'zh-CN', defaultReportLabels['zh-CN'])).toBe('10 分钟');
  });

  it('formats wall-clock time in the explicitly supplied time zone', () => {
    expect(formatDateTime('2026-08-29T10:00:00.000Z', 'zh-CN', 'Asia/Shanghai')).toBe(
      '2026/08/29 18:00',
    );
    expect(formatDateTime('2026-08-29T10:00:00.000Z', 'en-US', 'UTC')).toContain('10:00');
  });

  it('interpolates template placeholders deterministically', () => {
    expect(interpolate('…另有 {count} 项', { count: '7' })).toBe('…另有 7 项');
    expect(interpolate('{value} 人时', { value: '1.5' })).toBe('1.5 人时');
  });
});
