import { z } from 'zod';

import { reportModeFactKeys, type ReportFacts, type ReportPolishOutput } from './types';

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

function allOutputText(output: ReportPolishOutput): string[] {
  return [
    output.executiveSummary,
    output.closingSummary,
    ...output.modeSections.flatMap((section) => [...section.paragraphs, ...section.bullets]),
  ];
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function containsKnownValue(text: string, values: readonly string[]): boolean {
  const normalizedText = normalized(text);
  return values.some((value) => value.trim() !== '' && normalizedText.includes(normalized(value)));
}

function isGrounded(facts: ReportFacts, output: ReportPolishOutput): boolean {
  const allowedHeadings = new Set(reportModeFactKeys[facts.mode]);
  const seenHeadings = new Set<string>();
  if (
    output.modeSections.some(
      (section) =>
        !allowedHeadings.has(section.headingKey as never) ||
        seenHeadings.has(section.headingKey) ||
        !seenHeadings.add(section.headingKey),
    )
  ) {
    return false;
  }

  const knownOwners = facts.outcomes.flatMap((outcome) =>
    outcome.owner?.trim() ? [outcome.owner] : [],
  );
  const knownDates = facts.outcomes.flatMap((outcome) =>
    outcome.dueDate?.trim() ? [outcome.dueDate] : [],
  );
  const decisionTitles = facts.outcomes
    .filter((outcome) => outcome.kind === 'DECISION')
    .map((outcome) => outcome.title);
  const knownNumbers = new Set(
    [
      JSON.stringify(facts),
      String(facts.outcomes.length),
      String(facts.totalPersonMinutes / 60),
      String(facts.unallocatedPersonMinutes / 60),
    ].flatMap((value) => value.match(/\d+(?:\.\d+)?/g) ?? []),
  );
  const ownerClaim = /\b(?:owner|owned|responsible)\b|负责人|負責人/i;
  const dueDateClaim = /\b(?:due|deadline)\b|截止(?:日期|時間)?/i;
  const decisionClaim =
    /\b(?:decided|decision|approved|chose|chosen)\b|决定|決定|决策|決策|拍板|選擇/i;
  const isoDate = /\b\d{4}-\d{2}-\d{2}\b/g;
  const number = /\b\d+(?:\.\d+)?\b/g;

  return allOutputText(output).every((text) => {
    if (ownerClaim.test(text) && !containsKnownValue(text, knownOwners)) return false;
    if (dueDateClaim.test(text) && !containsKnownValue(text, knownDates)) return false;
    if (decisionClaim.test(text) && !containsKnownValue(text, decisionTitles)) return false;
    if ((text.match(isoDate) ?? []).some((date) => !knownDates.includes(date))) return false;
    return (text.match(number) ?? []).every((value) => knownNumbers.has(value));
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
