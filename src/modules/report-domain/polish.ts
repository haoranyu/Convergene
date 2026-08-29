import { z } from 'zod';

import {
  reportModeFactKeys,
  type ReportFacts,
  type ReportModeFactKey,
  type ReportPolishOutput,
} from './types';

const allHeadingKeys = [...new Set(Object.values(reportModeFactKeys).flat())] as [
  (typeof reportModeFactKeys)[keyof typeof reportModeFactKeys][number],
  ...Array<(typeof reportModeFactKeys)[keyof typeof reportModeFactKeys][number]>,
];

export const reportPolishOutputSchema = z.object({
  closingSummary: z.string().trim().max(1_000),
  executiveSummary: z.string().trim().min(1).max(2_000),
  modeSections: z
    .array(
      z.object({
        bullets: z.array(z.string().trim().min(1).max(500)).max(12),
        headingKey: z.enum(allHeadingKeys),
        paragraphs: z.array(z.string().trim().min(1).max(1_000)).max(6),
      }),
    )
    .max(6),
});

function isExactKnownValue(text: string, values: readonly string[]): boolean {
  const normalizedText = text.trim().normalize('NFKC');
  return values.some(
    (value) => value.trim() !== '' && value.trim().normalize('NFKC') === normalizedText,
  );
}

function isGrounded(facts: ReportFacts, output: ReportPolishOutput): boolean {
  const allowedHeadings = new Set<ReportModeFactKey>(reportModeFactKeys[facts.mode]);
  const seenHeadings = new Set<ReportModeFactKey>();
  for (const section of output.modeSections) {
    if (seenHeadings.has(section.headingKey) || !allowedHeadings.has(section.headingKey)) {
      return false;
    }
    seenHeadings.add(section.headingKey);
  }

  const summaryFacts = [
    facts.objective,
    ...facts.unknowns,
    ...facts.parkingLot,
    ...Object.values(facts.modeFacts).flat(),
    ...facts.outcomes.flatMap((outcome) =>
      [outcome.title, outcome.note].filter(
        (value): value is string => typeof value === 'string' && value.trim() !== '',
      ),
    ),
  ];
  if (!isExactKnownValue(output.executiveSummary, summaryFacts)) return false;
  if (output.closingSummary !== '' && !isExactKnownValue(output.closingSummary, summaryFacts)) {
    return false;
  }
  return output.modeSections.every((section) => {
    const sectionFacts = facts.modeFacts[section.headingKey];
    return [...section.paragraphs, ...section.bullets].every((text) =>
      isExactKnownValue(text, sectionFacts),
    );
  });
}

export function validateReportPolish(
  facts: ReportFacts,
  candidate: unknown,
): ReportPolishOutput | undefined {
  const parsed = reportPolishOutputSchema.safeParse(candidate);
  if (!parsed.success || !isGrounded(facts, parsed.data)) return undefined;
  return parsed.data;
}
