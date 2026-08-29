import { describe, expect, it } from 'vitest';

import {
  decisionScenario,
  generalScenario,
  hostileTextScenario,
  noOutcomeScenario,
  retroScenario,
} from '@/fixtures/report-domain';
import { renderStrictMermaid } from '@/modules/integration-validation/mermaid-renderer';
import {
  buildFactDraft,
  buildMermaidCharts,
  escapeMarkdownInline,
  escapeMarkdownTableCell,
  renderFallbackTables,
} from '@/modules/report-domain';
import type { ReportFacts } from '@/modules/report-domain';

function factsOf(scenario: ReturnType<typeof decisionScenario>): ReportFacts {
  const result = buildFactDraft(scenario.meeting, scenario.graph, scenario.outcomes, {
    timezone: scenario.timezone,
  });
  if (!result.ok) throw new Error(`fixture must build facts: ${result.error.code}`);
  return result.value;
}

function sectionById(sections: ReturnType<typeof renderFallbackTables>, id: string) {
  const section = sections.find((candidate) => candidate.id === id);
  expect(section, `section ${id} must exist`).toBeDefined();
  return section;
}

describe('renderFallbackTables', () => {
  it('renders the deterministic base and mode sections for a DECISION meeting', () => {
    const sections = renderFallbackTables(factsOf(decisionScenario()), 'zh-CN');

    expect(sections.map((section) => section.id)).toEqual([
      'summary',
      'mode-facts',
      'outcomes',
      'next-steps',
      'person-time',
      'outcome-timeline',
      'parking-lot',
      'unknowns',
    ]);

    expect(sectionById(sections, 'summary')?.markdown).toBe(
      [
        '| 项目 | 值 |',
        '| --- | --- |',
        '| 剧本 | 决策对齐 |',
        '| 会议目标 | Choose the launch plan |',
        '| 计划时间 | 2026/08/29 18:00 – 2026/08/29 19:00 |',
        '| 实际时间 | 2026/08/29 18:00 – 2026/08/29 19:10 |',
        '| 时区 | Asia/Shanghai |',
        '| 实际参会人数 | 4 |',
        '| 总人时（估算） | 4.7 人时 |',
        '| 未归属人时（估算） | 2 人时 |',
        '| 超时 | 10 分钟 |',
      ].join('\n'),
    );

    expect(sectionById(sections, 'mode-facts')).toMatchObject({ title: '决策明细' });
    expect(sectionById(sections, 'mode-facts')?.markdown).toBe(
      [
        '### 最终决策',
        '',
        '- Guided rollout',
        '',
        '### 未选方案',
        '',
        '- Big-bang launch',
        '',
        '### 风险',
        '',
        '- Data migration risk',
      ].join('\n'),
    );

    expect(sectionById(sections, 'outcomes')?.markdown).toBe(
      [
        '| 类型 | 内容 | 负责人 | 截止时间 | 备注 | 形成成本（人时，估算） | 标记 |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| 决策 | Guided rollout | — | — | — | 1 人时 | — |',
        '| 行动项 | Schedule rollback rehearsal | Casey | 2026-09-05 | — | 1.7 人时 | — |',
        '| 洞察 | Data migration risk | — | — | Confirmed after the meeting ended | — | 会后补记 |',
      ].join('\n'),
    );

    expect(sectionById(sections, 'next-steps')?.markdown).toBe(
      '- Schedule rollback rehearsal (负责人: Casey; 截止时间: 2026-09-05)',
    );

    expect(sectionById(sections, 'person-time')?.markdown).toBe(
      [
        '| 条目 | 人时（估算） |',
        '| --- | --- |',
        '| Guided rollout | 1 人时 |',
        '| Schedule rollback rehearsal | 1.7 人时 |',
        '| 未归属人时 | 2 人时 |',
        '| 合计 | 4.7 人时 |',
        '',
        '人时与形成成本为估算值，不构成精确财务成本。',
      ].join('\n'),
    );

    expect(sectionById(sections, 'outcome-timeline')?.markdown).toBe(
      [
        '| 分钟 | 时间 | 内容 |',
        '| --- | --- | --- |',
        '| 15 | 2026/08/29 18:15 | 决策 · Guided rollout |',
        '| 40 | 2026/08/29 18:40 | 行动项 · Schedule rollback rehearsal |',
      ].join('\n'),
    );

    expect(sectionById(sections, 'parking-lot')?.markdown).toBe('- Mobile app scope');
    expect(sectionById(sections, 'unknowns')?.markdown).toBe('- Final legal review date');
  });

  it('omits the mode section for the GENERAL fallback but keeps the base', () => {
    const sections = renderFallbackTables(factsOf(generalScenario()), 'zh-CN');

    expect(sections.some((section) => section.id === 'mode-facts')).toBe(false);
    expect(sections.map((section) => section.id)).toEqual([
      'summary',
      'outcomes',
      'next-steps',
      'person-time',
      'outcome-timeline',
      'parking-lot',
      'unknowns',
    ]);
    expect(sectionById(sections, 'summary')?.markdown).toContain('| 剧本 | 通用讨论 |');
  });

  it('states the zero-outcome fact explicitly instead of hiding it', () => {
    const sections = renderFallbackTables(factsOf(noOutcomeScenario()), 'zh-CN');

    expect(sectionById(sections, 'outcomes')?.markdown).toBe('本次会议未标记正式产出。');
    expect(sectionById(sections, 'next-steps')?.markdown).toBe('本次会议没有行动项。');
    expect(sections.some((section) => section.id === 'outcome-timeline')).toBe(false);
    expect(sectionById(sections, 'person-time')?.markdown).toContain('| 未归属人时 | 2.3 人时 |');
  });

  it('marks POST_MEETING outcomes and leaves their cost cell empty', () => {
    const sections = renderFallbackTables(factsOf(retroScenario()), 'zh-CN');
    const outcomes = sectionById(sections, 'outcomes')?.markdown ?? '';

    expect(outcomes).toContain(
      '| 洞察 | Alert fatigue hid the first signal | — | — | — | — | 会后补记 |',
    );
    // Post-meeting additions never appear in the person-time table.
    const personTime = sectionById(sections, 'person-time')?.markdown ?? '';
    expect(personTime).not.toContain('Alert fatigue');
  });

  it('escapes pipes, backslashes, angle brackets, and line breaks in cells', () => {
    const sections = renderFallbackTables(factsOf(hostileTextScenario()), 'en-US');
    const outcomes = sectionById(sections, 'outcomes')?.markdown ?? '';

    expect(outcomes).toContain('Owner "The \\| Pipe" \\<img src=x\\>');
    expect(outcomes).toContain(
      'Line1 Line2 \\| \\<b\\>bold\\</b\\> "quoted" #35; [link](https://example.com)',
    );
    expect(outcomes).toContain('Clock 10:00 risk; semi new line 👾');
    // No cell may leak a raw pipe: every line has the same column count.
    for (const line of outcomes.split('\n')) {
      expect(line.match(/(?<!\\)\|/g)?.length).toBe(8);
    }

    const unknowns = sectionById(sections, 'unknowns')?.markdown ?? '';
    expect(unknowns).toBe('- Budget "final" | \\<b\\>?\\</b\\> second line');

    const summary = sectionById(sections, 'summary')?.markdown ?? '';
    expect(summary).toContain('Choose the "safe" plan \\| \\<script\\>alert(1)\\</script\\>');
  });

  it('localizes all three supported locales', () => {
    const facts = factsOf(decisionScenario());

    const en = renderFallbackTables(facts, 'en-US');
    expect(sectionById(en, 'outcomes')?.markdown).toContain(
      '| Type | Outcome | Owner | Due | Note | Formation cost (person-hours, estimate) | Marking |',
    );
    expect(sectionById(en, 'outcomes')?.markdown).toContain('1 person-hour');
    expect(sectionById(en, 'outcomes')?.markdown).toContain('1.7 person-hours');
    expect(sectionById(en, 'outcomes')?.markdown).toContain('Post-meeting note');
    expect(sectionById(en, 'summary')?.markdown).toContain('| Script | Decision & Alignment |');

    const tw = renderFallbackTables(facts, 'zh-TW');
    expect(sectionById(tw, 'summary')?.markdown).toContain('| 劇本 | 決策對齊 |');
    expect(sectionById(tw, 'outcomes')?.markdown).toContain('會後補記');
    expect(sectionById(tw, 'person-time')?.markdown).toContain('人時與形成成本為估算值');
  });

  it('accepts label overrides through the typed localization boundary', () => {
    const sections = renderFallbackTables(factsOf(retroScenario()), 'en-US', {
      labels: { postMeetingTag: 'Added after end' },
    });

    expect(sectionById(sections, 'outcomes')?.markdown).toContain('Added after end');
    expect(sectionById(sections, 'outcomes')?.markdown).not.toContain('Post-meeting note');
  });

  it('is byte-identical for identical facts', () => {
    const facts = factsOf(hostileTextScenario());
    expect(renderFallbackTables(facts, 'zh-TW')).toEqual(renderFallbackTables(facts, 'zh-TW'));
  });
});

describe('AT-095 regression: tables survive Mermaid failure', () => {
  it('renders identical tables whether or not charts were generated first', () => {
    const facts = factsOf(decisionScenario());

    const tablesAlone = renderFallbackTables(facts, 'zh-CN');
    buildMermaidCharts(facts, 'zh-CN');
    const tablesAfterCharts = renderFallbackTables(facts, 'zh-CN');

    expect(tablesAfterCharts).toEqual(tablesAlone);
  });

  it('keeps facts and tables usable when the Mermaid renderer fails', async () => {
    const facts = factsOf(hostileTextScenario());
    const charts = buildMermaidCharts(facts, 'zh-CN');
    expect(charts.length).toBeGreaterThan(0);

    const failingRenderer = {
      initialize: () => undefined,
      render: () => Promise.reject(new Error('renderer exploded')),
    };

    for (const chart of charts) {
      const rendered = await renderStrictMermaid(
        `regression-${chart.id}`,
        chart.source,
        '| fallback | available |',
        failingRenderer,
      );
      expect(rendered).toMatchObject({ errorCode: 'MERMAID_RENDER_FAILED', ok: false });
    }

    const sections = renderFallbackTables(facts, 'zh-CN');
    expect(sections.map((section) => section.id)).toEqual([
      'summary',
      'mode-facts',
      'outcomes',
      'next-steps',
      'person-time',
      'outcome-timeline',
      'parking-lot',
      'unknowns',
    ]);
    // Every fact is still present in table form.
    expect(sectionById(sections, 'outcome-timeline')?.markdown).toContain('Plan C: risky');
  });

  it('omits chart and timeline table gracefully when actual start is missing', () => {
    const facts = factsOf(decisionScenario());
    const degraded: ReportFacts = {
      ...facts,
      schedule: { ...facts.schedule, actual: { end: facts.schedule.actual.end } },
    };

    const charts = buildMermaidCharts(degraded, 'en-US');
    expect(charts.some((chart) => chart.id === 'outcome-timeline')).toBe(false);

    const sections = renderFallbackTables(degraded, 'en-US');
    expect(sections.some((section) => section.id === 'outcome-timeline')).toBe(false);
    expect(sectionById(sections, 'summary')).toBeDefined();
    expect(sectionById(sections, 'outcomes')).toBeDefined();
    expect(sectionById(sections, 'person-time')).toBeDefined();
  });
});

describe('Markdown escaping helpers', () => {
  it('escapes the table delimiter and backslash in the right order', () => {
    expect(escapeMarkdownTableCell('a|b')).toBe('a\\|b');
    expect(escapeMarkdownTableCell('a\\b|c')).toBe('a\\\\b\\|c');
    expect(escapeMarkdownTableCell('<b>x</b>')).toBe('\\<b\\>x\\</b\\>');
    expect(escapeMarkdownTableCell('a\nb\r\nc\td')).toBe('a b c d');
  });

  it('keeps pipes literal in inline (non-table) context', () => {
    expect(escapeMarkdownInline('a|b <c>')).toBe('a|b \\<c\\>');
  });
});
