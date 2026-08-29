import { describe, expect, it } from 'vitest';

import {
  brainstormScenario,
  decisionScenario,
  generalScenario,
  hostileTextScenario,
  noOutcomeScenario,
  oversizedScenario,
  retroScenario,
} from '@/fixtures/report-domain';
import {
  buildFactDraft,
  buildMermaidCharts,
  escapeMermaidLabel,
  escapeMermaidTimelineText,
  reportMermaidLimits,
  truncateGraphemes,
} from '@/modules/report-domain';
import type { ReportFacts } from '@/modules/report-domain';

function factsOf(scenario: ReturnType<typeof decisionScenario>): ReportFacts {
  const result = buildFactDraft(scenario.meeting, scenario.graph, scenario.outcomes, {
    timezone: scenario.timezone,
  });
  if (!result.ok) throw new Error(`fixture must build facts: ${result.error.code}`);
  return result.value;
}

describe('buildMermaidCharts', () => {
  it('builds the DECISION storyline, timeline, and pie for a decision meeting', () => {
    const charts = buildMermaidCharts(factsOf(decisionScenario()), 'zh-CN');

    expect(charts.map((chart) => chart.id)).toEqual([
      'mode-flowchart',
      'outcome-timeline',
      'person-time',
    ]);

    const flowchart = charts[0];
    expect(flowchart?.source).toBe(
      [
        'flowchart LR',
        '    n1["Choose the launch plan"]',
        '    n2["★ Guided rollout"]',
        '    n3["Big-bang launch"]',
        '    n4["★ Data migration risk"]',
        '    n5["★ Schedule rollback rehearsal"]',
        '    n1 --> n2',
        '    n1 --> n3',
        '    n1 --> n4',
        '    n1 --> n5',
      ].join('\n'),
    );

    const timeline = charts[1];
    expect(timeline?.source).toBe(
      [
        'timeline',
        '    title 产出时间线',
        '    第 0 分钟 : 会议开始',
        '    第 15 分钟 : Guided rollout',
        '    第 40 分钟 : Schedule rollback rehearsal',
      ].join('\n'),
    );

    const pie = charts[2];
    expect(pie?.source).toBe(
      [
        'pie showData',
        '    title 人时分配',
        '    "Guided rollout" : 60',
        '    "Schedule rollback rehearsal" : 100',
        '    "未归属人时" : 120',
      ].join('\n'),
    );
  });

  it('groups BRAINSTORM ideas under their topic', () => {
    const charts = buildMermaidCharts(factsOf(brainstormScenario()), 'zh-CN');

    expect(charts[0]?.source).toBe(
      [
        'flowchart LR',
        '    n1["Improve onboarding activation"]',
        '    n2["Divergent directions"]',
        '    n3["★ Gamified checklist"]',
        '    n4["★ Concierge onboarding call"]',
        '    n5["AI-generated sample workspace"]',
        '    n1 --> n2',
        '    n2 --> n3',
        '    n2 --> n4',
        '    n2 --> n5',
      ].join('\n'),
    );
  });

  it('keeps the RETRO cause-to-action chain from real containment edges', () => {
    const charts = buildMermaidCharts(factsOf(retroScenario()), 'zh-CN');

    expect(charts[0]?.source).toBe(
      [
        'flowchart LR',
        '    n1["Retro: the failed 2.4 release"]',
        '    n2["Causes"]',
        '    n3["★ Load test was skipped"]',
        '    n4["★ Add load-test gate to CI"]',
        '    n5["★ Alert fatigue hid the first signal"]',
        '    n1 --> n2',
        '    n2 --> n3',
        '    n3 --> n4',
        '    n2 --> n5',
      ].join('\n'),
    );
  });

  it('renders the GENERAL fallback as topics plus marked outcomes', () => {
    const charts = buildMermaidCharts(factsOf(generalScenario()), 'zh-CN');

    expect(charts[0]?.title).toBe('会议脉络');
    expect(charts[0]?.source).toBe(
      [
        'flowchart LR',
        '    n1["Align the weekly sync"]',
        '    n2["Status round"]',
        '    n3["Blockers"]',
        '    n4["★ Move release notes to async"]',
        '    n5["Planning"]',
        '    n1 --> n2',
        '    n1 --> n3',
        '    n3 --> n4',
        '    n1 --> n5',
      ].join('\n'),
    );
  });

  it('localizes chart titles and generated labels', () => {
    const facts = factsOf(decisionScenario());
    const enCharts = buildMermaidCharts(facts, 'en-US');
    const twCharts = buildMermaidCharts(facts, 'zh-TW');

    expect(enCharts[0]?.title).toBe('Decision flow');
    expect(enCharts[1]?.source).toContain('Minute 0 : Meeting started');
    expect(enCharts[2]?.source).toContain('"Unattributed" : 120');
    expect(twCharts[1]?.source).toContain('第 0 分鐘 : 會議開始');
    expect(twCharts[2]?.source).toContain('"未歸屬人時" : 120');
  });

  it('never emits more than three charts', () => {
    const charts = buildMermaidCharts(factsOf(oversizedScenario()), 'zh-CN');

    expect(charts.length).toBeLessThanOrEqual(reportMermaidLimits.maxCharts);
    expect(charts.map((chart) => chart.id)).toEqual([
      'mode-flowchart',
      'outcome-timeline',
      'person-time',
    ]);
  });

  it('produces byte-identical source for identical facts and for shuffled inputs', () => {
    const scenario = hostileTextScenario();
    const first = buildMermaidCharts(factsOf(scenario), 'en-US');
    const second = buildMermaidCharts(factsOf(scenario), 'en-US');
    expect(second).toEqual(first);

    const shuffled = buildFactDraft(
      scenario.meeting,
      {
        ...scenario.graph,
        edges: [...scenario.graph.edges].reverse(),
        nodes: [...scenario.graph.nodes].reverse(),
      },
      [...scenario.outcomes].reverse(),
      { timezone: scenario.timezone },
    );
    if (!shuffled.ok) throw new Error('fixture must build facts');
    expect(buildMermaidCharts(shuffled.value, 'en-US')).toEqual(first);
  });

  it('emits no placeholder charts when a meeting has no outcomes', () => {
    const facts = factsOf(noOutcomeScenario());
    const charts = buildMermaidCharts(facts, 'zh-CN');

    // The topic storyline is factual, but a timeline needs LIVE outcomes and
    // a one-slice pie carries no distribution.
    expect(charts.map((chart) => chart.id)).toEqual(['mode-flowchart']);
  });

  it('emits no flowchart when the tree projection holds only the root', () => {
    const facts = factsOf(brainstormScenario());
    const rootOnly: ReportFacts = {
      ...facts,
      discussionTree: facts.discussionTree.filter((node) => node.parentNodeId === undefined),
    };

    const charts = buildMermaidCharts(rootOnly, 'zh-CN');

    expect(charts.some((chart) => chart.id === 'mode-flowchart')).toBe(false);
    expect(charts.map((chart) => chart.id)).toEqual(['outcome-timeline', 'person-time']);
  });

  it('keeps timeline period labels free of clock colons', () => {
    const charts = buildMermaidCharts(factsOf(hostileTextScenario()), 'en-US');
    const timeline = charts.find((chart) => chart.id === 'outcome-timeline');

    expect(timeline).toBeDefined();
    const periodLines = (timeline?.source ?? '')
      .split('\n')
      .filter((line) => line.startsWith('    Minute'));
    for (const line of periodLines) {
      const period = line.split(' : ')[0] ?? '';
      expect(period).not.toContain(':');
    }
    // The hostile colon and semicolon in the title are fullwidth-escaped.
    expect(timeline?.source).toContain('Plan C： risky "move"； now');
  });

  it('escapes quotes and entity bait in flowchart and pie labels', () => {
    const charts = buildMermaidCharts(factsOf(hostileTextScenario()), 'en-US');
    const flowchart = charts.find((chart) => chart.id === 'mode-flowchart');

    // `#` is escaped first so literal `#quot;` in user text stays literal.
    expect(flowchart?.source).toContain(
      'n2["★ Plan #quot;A#quot; #35;35; #35;quot; #60;i#62;x#60;/i#62;"]',
    );
    expect(flowchart?.source).not.toContain('<script>');

    const pie = charts.find((chart) => chart.id === 'person-time');
    expect(pie?.source).toContain('"Same name" : 60');
    expect(pie?.source).toContain('"Same name (2)" : 32');
  });

  it('bounds the flowchart with an explicit overflow node', () => {
    const charts = buildMermaidCharts(factsOf(oversizedScenario()), 'zh-CN');
    const flowchart = charts.find((chart) => chart.id === 'mode-flowchart');
    const nodeLines = (flowchart?.source ?? '').split('\n').filter((line) => line.includes('["'));

    // 24 kept real nodes plus one overflow marker.
    expect(nodeLines.length).toBe(reportMermaidLimits.maxFlowchartNodes + 1);
    expect(flowchart?.source).toContain('…另有 7 项');
    const edgeLines = (flowchart?.source ?? '').split('\n').filter((line) => line.includes('-->'));
    expect(edgeLines.length).toBeLessThanOrEqual(reportMermaidLimits.maxFlowchartNodes);
  });

  it('bounds the timeline with an explicit overflow event', () => {
    const charts = buildMermaidCharts(factsOf(oversizedScenario()), 'zh-CN');
    const timeline = charts.find((chart) => chart.id === 'outcome-timeline');

    expect(timeline?.source).toContain('…另有 8 项');
    const eventCount = (timeline?.source ?? '')
      .split('\n')
      .filter((line) => line.startsWith('    第'))
      .flatMap((line) => line.split(' : ').slice(1)).length;
    expect(eventCount).toBeLessThanOrEqual(reportMermaidLimits.maxTimelineEvents);
  });

  it('bounds the pie with an aggregated other-items slice', () => {
    const charts = buildMermaidCharts(factsOf(oversizedScenario()), 'zh-CN');
    const pie = charts.find((chart) => chart.id === 'person-time');
    const sliceLines = (pie?.source ?? '').split('\n').filter((line) => line.includes('" : '));

    expect(sliceLines.length).toBeLessThanOrEqual(reportMermaidLimits.maxPieSlices);
    expect(pie?.source).toContain('其他 20 项');
  });

  it('omits the pie when fewer than two positive slices exist', () => {
    const facts = factsOf(noOutcomeScenario());
    const charts = buildMermaidCharts(facts, 'en-US');

    expect(charts.some((chart) => chart.id === 'person-time')).toBe(false);
  });
});

describe('escaping helpers', () => {
  it('truncates on grapheme boundaries with an ellipsis', () => {
    const long = '决定🚀'.repeat(30);
    const truncated = truncateGraphemes(long, 48);

    expect(
      [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(truncated)].length,
    ).toBe(49);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('normalizes line breaks and whitespace in labels', () => {
    expect(escapeMermaidLabel('first\nsecond\r\nthird\t end ')).toBe('first second third end');
  });

  it('escapes hash before quote so entity bait stays literal', () => {
    expect(escapeMermaidLabel('a #quot; b # c "d"')).toBe('a #35;quot; b #35; c #quot;d#quot;');
  });

  it('escapes colons and semicolons for timeline events only', () => {
    expect(escapeMermaidTimelineText('10:00; decided "yes" #1')).toBe('10：00； decided "yes" #1');
    expect(escapeMermaidLabel('10:00; ok')).toBe('10:00; ok');
  });
});
