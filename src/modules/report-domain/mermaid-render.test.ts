/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  brainstormScenario,
  cjkScenario,
  decisionScenario,
  generalScenario,
  hostileTextScenario,
  oversizedScenario,
  retroScenario,
} from '@/fixtures/report-domain';
import {
  renderStrictMermaid,
  strictMermaidConfiguration,
} from '@/modules/integration-validation/mermaid-renderer';
import { buildFactDraft, buildMermaidCharts } from '@/modules/report-domain';
import type { MermaidChart, ReportFacts } from '@/modules/report-domain';

class TestCSSStyleSheet {
  cssRules: Array<{ cssText: string }> = [];

  insertRule(rule: string, index = this.cssRules.length): number {
    this.cssRules.splice(index, 0, { cssText: rule });
    return index;
  }

  replaceSync(css: string): void {
    this.cssRules = [{ cssText: css }];
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true,
    value: TestCSSStyleSheet,
  });
  const measurableSvgPrototype = SVGElement.prototype as unknown as {
    getBBox(): DOMRect;
    getComputedTextLength(): number;
    textContent?: string | null;
  };
  measurableSvgPrototype.getBBox = () => ({ height: 36, width: 160, x: 0, y: 0 }) as DOMRect;
  measurableSvgPrototype.getComputedTextLength = function getComputedTextLength() {
    return (this.textContent?.length ?? 0) * 8;
  };
});

function factsOf(scenario: ReturnType<typeof decisionScenario>): ReportFacts {
  const result = buildFactDraft(scenario.meeting, scenario.graph, scenario.outcomes, {
    timezone: scenario.timezone,
  });
  if (!result.ok) throw new Error(`fixture must build facts: ${result.error.code}`);
  return result.value;
}

async function renderChart(chart: MermaidChart, suffix: string) {
  return renderStrictMermaid(`report-domain-${chart.id}-${suffix}`, chart.source, '| F | T |');
}

describe('report-domain Mermaid strict-mode rendering', () => {
  it('renders every chart of every primary script and the general fallback', async () => {
    const scenarios = [
      decisionScenario(),
      brainstormScenario(),
      retroScenario(),
      generalScenario(),
    ];

    for (const scenario of scenarios) {
      const charts = buildMermaidCharts(factsOf(scenario), 'zh-CN');
      expect(charts.length).toBeGreaterThan(0);
      for (const chart of charts) {
        const result = await renderChart(chart, scenario.meeting.mode ?? 'general');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.svg).toContain('<svg');
        }
      }
    }
  });

  it('renders hostile user text under securityLevel strict without raw HTML', async () => {
    expect(strictMermaidConfiguration.securityLevel).toBe('strict');
    const charts = buildMermaidCharts(factsOf(hostileTextScenario()), 'en-US');

    for (const chart of charts) {
      const result = await renderChart(chart, 'hostile');
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      // Strict mode encodes markup into inert text ("&lt;script&gt;"); the
      // assertions target executable elements, not the visible user words.
      expect(result.svg).not.toContain('<script');
      expect(result.svg).not.toContain('<img');
    }

    // Entity escaping round-trips: literal `#quot;` and `#35;` bait in user
    // text stays literal, while real quotes decode back to quotes.
    const flowchart = charts.find((chart) => chart.id === 'mode-flowchart');
    const rendered = await renderChart(flowchart as MermaidChart, 'hostile-flow');
    expect(rendered.ok).toBe(true);
    if (rendered.ok) {
      expect(rendered.svg).toContain('Plan "A" #35; #quot;');
      expect(rendered.svg).not.toContain('#35;35;');
    }
  });

  it('renders CJK and emoji node titles in rect nodes (regression for the btoa crash)', async () => {
    const charts = buildMermaidCharts(factsOf(cjkScenario()), 'zh-CN');
    const flowchart = charts.find((chart) => chart.id === 'mode-flowchart');
    expect(flowchart).toBeDefined();
    if (flowchart === undefined) return;

    const result = await renderChart(flowchart, 'cjk');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.svg).toContain('灰度发布');
      expect(result.svg).toContain('★');
    }
  });

  it('renders bounded charts for oversized meetings', async () => {
    const charts = buildMermaidCharts(factsOf(oversizedScenario()), 'zh-CN');

    for (const chart of charts) {
      const result = await renderChart(chart, 'oversized');
      expect(result.ok).toBe(true);
    }
  });
});
