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
  const allowedHeadings = new Set<ReportModeFactKey>(reportModeFactKeys[facts.mode]);
  const seenHeadings = new Set<ReportModeFactKey>();
  for (const section of output.modeSections) {
    if (seenHeadings.has(section.headingKey) || !allowedHeadings.has(section.headingKey)) {
      return false;
    }
    seenHeadings.add(section.headingKey);
  }

  const knownDates = facts.outcomes.flatMap((outcome) =>
    outcome.dueDate?.trim() ? [outcome.dueDate] : [],
  );
  const decisionTitles = facts.outcomes
    .filter((outcome) => outcome.kind === 'DECISION')
    .map((outcome) => outcome.title);
  const knownOptions = facts.modeFacts.decision_rejected_options;
  const knownReasons = [
    ...facts.modeFacts.decision_rationale,
    ...facts.modeFacts.retro_causes,
    ...facts.outcomes.flatMap((outcome) => (outcome.note?.trim() ? [outcome.note] : [])),
  ];
  const knownText = [
    facts.title,
    facts.objective,
    facts.mode,
    ...facts.unknowns,
    ...facts.parkingLot,
    ...Object.values(facts.modeFacts).flat(),
    ...facts.outcomes.flatMap((outcome) =>
      [outcome.title, outcome.note, outcome.owner, outcome.dueDate].filter(
        (value): value is string => typeof value === 'string' && value.trim() !== '',
      ),
    ),
  ];
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
  const optionClaim = /\b(?:option|alternative|proposal)\b|方案|选项|選項|备选|備選/i;
  const reasonClaim =
    /\b(?:because|cause[ds]?|reason|delayed?|due to)\b|因为|因為|原因|导致|導致|造成|延误|延誤/i;
  const speechClaim = /\b(?:said|stated|mentioned|told)\b|表示|提到|说|說|发言|發言/i;
  const isoDate = /\b\d{4}-\d{2}-\d{2}\b/g;
  const number = /\b\d+(?:\.\d+)?\b/g;

  return allOutputText(output).every((text) => {
    if (text.trim() === '') return true;
    if (!containsKnownValue(text, knownText)) return false;
    // Ownership, deadlines, and attributed speech stay in deterministic tables only.
    if (ownerClaim.test(text) || dueDateClaim.test(text) || speechClaim.test(text)) return false;
    if (decisionClaim.test(text) && !containsKnownValue(text, decisionTitles)) return false;
    if (optionClaim.test(text) && !containsKnownValue(text, knownOptions)) return false;
    if (reasonClaim.test(text) && !containsKnownValue(text, knownReasons)) return false;
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
