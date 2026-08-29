import type { MeetingAggregate } from '@/modules/meeting-db';
import {
  calculateMeetingEconomics,
  type MeetingDomainErrorCode,
  type MeetingMode,
  type MeetingOutcome,
} from '@/modules/meeting-domain';
import type { Result } from '@/modules/shared';

import type { ReportFacts, ReportModeFactKey } from './types';

function failure(code: MeetingDomainErrorCode): Result<never, MeetingDomainErrorCode> {
  return { error: { code }, ok: false };
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function outcomesOfKind(
  outcomes: readonly MeetingOutcome[],
  nodeTitles: ReadonlyMap<string, string>,
  kind: MeetingOutcome['kind'],
): string[] {
  return stableUnique(
    outcomes
      .filter((outcome) => outcome.kind === kind)
      .map((outcome) => nodeTitles.get(outcome.nodeId) ?? ''),
  );
}

function buildModeFacts(
  aggregate: MeetingAggregate,
  mode: MeetingMode,
  nodeTitles: ReadonlyMap<string, string>,
): Record<ReportModeFactKey, string[]> {
  const byKind = (kind: (typeof aggregate.nodes)[number]['kind']) =>
    stableUnique(
      aggregate.nodes
        .filter((node) => node.kind === kind)
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
        )
        .map((node) => node.title),
    );
  const allOutcomes = stableUnique(
    aggregate.outcomes.map((outcome) => nodeTitles.get(outcome.nodeId) ?? ''),
  );
  const facts: Record<ReportModeFactKey, string[]> = {
    brainstorm_candidates: [],
    brainstorm_groups: [],
    brainstorm_ideas: [],
    decision_options: [],
    decision_outcomes: [],
    decision_risks: [],
    general_outcomes: [],
    retro_actions: [],
    retro_causes: [],
    retro_insights: [],
  };

  switch (mode) {
    case 'DECISION':
      facts.decision_outcomes = outcomesOfKind(aggregate.outcomes, nodeTitles, 'DECISION');
      facts.decision_options = byKind('OPTION');
      facts.decision_risks = byKind('RISK');
      break;
    case 'BRAINSTORM':
      facts.brainstorm_candidates = outcomesOfKind(
        aggregate.outcomes,
        nodeTitles,
        'CANDIDATE_IDEA',
      );
      facts.brainstorm_ideas = byKind('IDEA');
      facts.brainstorm_groups = byKind('TOPIC');
      break;
    case 'RETRO':
      facts.retro_insights = outcomesOfKind(aggregate.outcomes, nodeTitles, 'INSIGHT');
      facts.retro_actions = outcomesOfKind(aggregate.outcomes, nodeTitles, 'ACTION');
      facts.retro_causes = byKind('TOPIC');
      break;
    case 'GENERAL':
      facts.general_outcomes = allOutcomes;
      break;
  }

  return facts;
}

/** Builds the only fact object that may cross the report-polish transport seam. */
export function buildReportFacts(
  aggregate: MeetingAggregate,
  timezone: string,
): Result<ReportFacts, MeetingDomainErrorCode> {
  const { meeting } = aggregate;
  if (
    meeting.status !== 'ENDED' ||
    meeting.mode === undefined ||
    meeting.startedAt === undefined ||
    meeting.endedAt === undefined ||
    meeting.actualAttendeeCount === undefined ||
    meeting.brief === undefined
  ) {
    return failure('INVALID_MEETING_STATE');
  }
  const normalizedTimezone = timezone.trim();
  if (normalizedTimezone === '' || !isValidTimezone(normalizedTimezone)) {
    return failure('INVALID_MEETING');
  }

  const economics = calculateMeetingEconomics(
    meeting,
    aggregate.outcomes,
    new Date(meeting.endedAt),
  );
  if (!economics.ok) return economics;

  const nodes = new Map(aggregate.nodes.map((node) => [node.id, node]));
  if (aggregate.outcomes.some((outcome) => !nodes.has(outcome.nodeId))) {
    return failure('INVALID_OUTCOME');
  }
  const formationCosts = new Map(
    economics.value.formationCosts.map((cost) => [cost.outcomeId, cost.formationPersonMinutes]),
  );
  const sortedOutcomes = [...aggregate.outcomes].sort((left, right) => {
    if (left.origin !== right.origin) return left.origin === 'LIVE' ? -1 : 1;
    return (
      (left.markedAt ?? '').localeCompare(right.markedAt ?? '') || left.id.localeCompare(right.id)
    );
  });
  const nodeTitles = new Map(aggregate.nodes.map((node) => [node.id, node.title]));

  return {
    ok: true,
    value: {
      attendeeCount: meeting.actualAttendeeCount,
      mode: meeting.mode,
      modeFacts: buildModeFacts(aggregate, meeting.mode, nodeTitles),
      objective: meeting.brief.objective,
      outcomes: sortedOutcomes.map((outcome) => {
        const node = nodes.get(outcome.nodeId)!;
        return {
          dueDate: outcome.dueDate,
          formationPersonMinutes: formationCosts.get(outcome.id),
          kind: outcome.kind,
          markedAt: outcome.markedAt,
          note: outcome.note ?? node.note,
          origin: outcome.origin,
          owner: outcome.owner,
          title: node.title,
        };
      }),
      overtimeMinutes: economics.value.overtimeMinutes,
      parkingLot: stableUnique(
        aggregate.nodes
          .filter((node) => node.kind === 'PARKING')
          .sort(
            (left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
          )
          .map((node) => node.title),
      ),
      schedule: {
        actual: { endAt: meeting.endedAt, startAt: meeting.startedAt },
        planned: { endAt: meeting.scheduledEndAt, startAt: meeting.scheduledStartAt },
        timezone: normalizedTimezone,
      },
      title: meeting.title,
      totalPersonMinutes: economics.value.totalPersonMinutes,
      unallocatedPersonMinutes: economics.value.unallocatedPersonMinutes,
      unknowns: stableUnique(meeting.brief.unknowns),
    },
  };
}
