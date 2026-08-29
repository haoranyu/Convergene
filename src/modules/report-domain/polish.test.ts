import { describe, expect, it } from 'vitest';

import { createReportFixture } from '@/fixtures/report';

import { buildReportFacts } from './facts';
import { validateReportPolish } from './polish';

function decisionFacts() {
  const result = buildReportFacts(createReportFixture(), 'UTC');
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('fixture must be valid');
  return result.value;
}

describe('report polish validation', () => {
  it('accepts wording anchored to known outcome facts and allowed mode sections', () => {
    const facts = decisionFacts();
    const candidate = {
      closingSummary: 'Agree on criteria is the recorded next step.',
      executiveSummary: 'Compare options is the recorded decision.',
      modeSections: [
        {
          bullets: ['Compare options'],
          headingKey: 'decision_outcomes',
          paragraphs: ['Compare options is the recorded decision.'],
        },
      ],
    };

    expect(validateReportPolish(facts, candidate)).toEqual(candidate);
  });

  it.each([
    {
      closingSummary: 'Avery owns this by 2026-09-10.',
      executiveSummary: 'Compare options is the recorded decision.',
      modeSections: [],
    },
    {
      closingSummary: '',
      executiveSummary: 'Casey and Avery are responsible for Compare options.',
      modeSections: [],
    },
    {
      closingSummary: '',
      executiveSummary: 'Redis caused a delay in Compare options.',
      modeSections: [],
    },
    {
      closingSummary: '',
      executiveSummary: 'Enterprise rollout is another option for Compare options.',
      modeSections: [],
    },
    {
      closingSummary: '',
      executiveSummary: 'Casey said Compare options was approved.',
      modeSections: [],
    },
    {
      closingSummary: '',
      executiveSummary: 'The meeting cost 9 person-hours.',
      modeSections: [],
    },
    {
      closingSummary: '',
      executiveSummary: 'The group chose an enterprise rollout.',
      modeSections: [],
    },
    {
      closingSummary: '',
      executiveSummary: 'Compare options is the recorded decision.',
      modeSections: [
        { bullets: [], headingKey: 'retro_actions', paragraphs: ['Agree on criteria'] },
      ],
    },
    {
      closingSummary: '',
      executiveSummary: 'Compare options is the recorded decision.',
      modeSections: [
        { bullets: [], headingKey: 'decision_outcomes', paragraphs: ['Compare options'] },
        { bullets: [], headingKey: 'decision_outcomes', paragraphs: ['Agree on criteria'] },
      ],
    },
  ])('rejects invented owners, dates, costs, decisions, or section keys', (candidate) => {
    expect(validateReportPolish(decisionFacts(), candidate)).toBeUndefined();
  });
});
