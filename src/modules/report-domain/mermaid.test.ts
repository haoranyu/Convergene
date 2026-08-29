import { describe, expect, it } from 'vitest';

import { englishReportDocumentCopy } from '@/fixtures/report-copy';
import { createReportFixture } from '@/fixtures/report';

import { buildReportFacts } from './facts';
import { buildMermaidCharts, escapeMermaidLabel } from './mermaid';

describe('deterministic report diagrams', () => {
  it('generates no more than three diagrams with matching readable tables', () => {
    const facts = buildReportFacts(createReportFixture(), 'UTC');
    expect(facts.ok).toBe(true);
    if (!facts.ok) return;

    const first = buildMermaidCharts(facts.value, 'en-US', englishReportDocumentCopy);
    const second = buildMermaidCharts(facts.value, 'en-US', englishReportDocumentCopy);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.every((chart) => chart.fallbackMarkdown.startsWith('| '))).toBe(true);
    expect(first.map((chart) => chart.type)).toEqual([
      'MODE_NARRATIVE',
      'OUTCOME_TIMELINE',
      'ALLOCATION',
    ]);
    expect(first.find((chart) => chart.type === 'OUTCOME_TIMELINE')?.fallbackMarkdown).toContain(
      '| 15 | Compare options | 1 |',
    );
  });

  it('escapes user text before it reaches Mermaid syntax', () => {
    const aggregate = createReportFixture();
    aggregate.meeting.brief = {
      ...aggregate.meeting.brief!,
      objective: 'Choose "] --> injected["owner: 10:00 <script>',
    };
    aggregate.nodes[1] = {
      ...aggregate.nodes[1],
      title: 'Approve "] --> stolen["yes',
    };
    const facts = buildReportFacts(aggregate, 'UTC');
    expect(facts.ok).toBe(true);
    if (!facts.ok) return;

    const definitions = buildMermaidCharts(facts.value, 'en-US', englishReportDocumentCopy).map(
      (chart) => chart.definition,
    );
    expect(definitions.join('\n')).not.toContain('"] --> injected[');
    expect(definitions.join('\n')).not.toContain('<script>');
    expect(definitions.join('\n')).toContain('&quot;');
    expect(definitions.join('\n')).toContain('&#58;');
    expect(escapeMermaidLabel('x[y]')).toBe('x&#91;y&#93;');
  });
});
