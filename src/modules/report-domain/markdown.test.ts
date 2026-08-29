import { describe, expect, it } from 'vitest';

import { englishReportDocumentCopy } from '@/fixtures/report-copy';
import { createReportFixture } from '@/fixtures/report';

import { buildReportFacts } from './facts';
import { assembleReportMarkdown } from './markdown';

function factsFor(aggregate: ReturnType<typeof createReportFixture>) {
  const facts = buildReportFacts(aggregate, 'UTC');
  expect(facts.ok).toBe(true);
  if (!facts.ok) throw new Error('fixture must produce report facts');
  return facts.value;
}

describe('deterministic report Markdown', () => {
  it('always includes the objective, localized dates, and singular outcome copy', () => {
    const aggregate = createReportFixture();
    aggregate.outcomes = aggregate.outcomes.slice(1);

    const markdown = assembleReportMarkdown(
      factsFor(aggregate),
      'en-US',
      englishReportDocumentCopy,
      [],
    );

    expect(markdown).toContain('**Meeting objective:** Choose the launch plan');
    expect(markdown).toContain('recorded 1 formal outcome.');
    expect(markdown).toContain('Sep 5, 2026');
  });

  it('keeps GENERAL on the common report base without a dedicated mode section', () => {
    const markdown = assembleReportMarkdown(
      factsFor(createReportFixture({ mode: 'GENERAL' })),
      'en-US',
      englishReportDocumentCopy,
      [],
    );

    expect(markdown).not.toContain('## Mode-specific details');
    expect(markdown).toContain('## Meeting outcomes');
  });

  it('preserves a non-calendar due-date note without crashing localized rendering', () => {
    const aggregate = createReportFixture();
    aggregate.outcomes = aggregate.outcomes.map((outcome) =>
      outcome.kind === 'ACTION' ? { ...outcome, dueDate: 'After legal review' } : outcome,
    );

    const markdown = assembleReportMarkdown(
      factsFor(aggregate),
      'en-US',
      englishReportDocumentCopy,
      [],
    );

    expect(markdown).toContain('After legal review');
  });
});
