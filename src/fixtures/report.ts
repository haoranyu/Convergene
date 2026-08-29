import { createLiveMeetingFixture } from '@/fixtures/live-meeting';
import type { MeetingAggregate } from '@/modules/meeting-db';
import type { MeetingMode, MeetingOutcome, SupportedLocale } from '@/modules/meeting-domain';
import type { MindMapNode, NodeKind } from '@/modules/mind-map-domain';

const endedAt = '2026-08-29T11:15:00.000Z';

const outcomeKindsByMode = {
  BRAINSTORM: ['CANDIDATE_IDEA', 'INSIGHT'],
  DECISION: ['DECISION', 'ACTION'],
  GENERAL: ['DECISION', 'INSIGHT'],
  RETRO: ['INSIGHT', 'ACTION'],
} as const satisfies Record<MeetingMode, readonly MeetingOutcome['kind'][]>;

const detailNodesByMode: Record<MeetingMode, Array<{ kind: NodeKind; title: string }>> = {
  BRAINSTORM: [
    { kind: 'IDEA', title: 'Partner preview' },
    { kind: 'IDEA', title: 'Open office hours' },
  ],
  DECISION: [
    { kind: 'OPTION', title: 'Phased launch' },
    { kind: 'RISK', title: 'Support capacity' },
  ],
  GENERAL: [{ kind: 'NOTE', title: 'Confirm the working boundary' }],
  RETRO: [
    { kind: 'INSIGHT', title: 'Handoffs obscured ownership' },
    { kind: 'ACTION', title: 'Name one handoff owner' },
  ],
};

export interface ReportFixtureOptions {
  locale?: SupportedLocale;
  mode?: MeetingMode;
  outcomes?: MeetingOutcome[];
}

export function createReportFixture({
  locale = 'en-US',
  mode = 'DECISION',
  outcomes,
}: ReportFixtureOptions = {}): MeetingAggregate {
  const aggregate = createLiveMeetingFixture({
    meeting: {
      contentLocale: locale,
      endedAt,
      mode,
      status: 'ENDED',
      updatedAt: endedAt,
    },
  });
  const modeDetails = detailNodesByMode[mode].map<MindMapNode>((detail, index) => ({
    createdAt: `2026-08-29T10:${String(31 + index).padStart(2, '0')}:00.000Z`,
    id: `mode-detail-${index + 1}`,
    kind: detail.kind,
    meetingId: aggregate.meeting.id,
    position: { x: 520, y: index * 120 },
    source: 'USER',
    title: detail.title,
    updatedAt: endedAt,
  }));
  aggregate.nodes.push(...modeDetails);
  aggregate.edges.push(
    ...modeDetails.map((node, index) => ({
      id: `edge-mode-detail-${index + 1}`,
      kind: 'CONTAINS' as const,
      meetingId: aggregate.meeting.id,
      sourceNodeId: index === 0 ? 'topic-options' : 'topic-risks',
      targetNodeId: node.id,
    })),
  );

  aggregate.outcomes =
    outcomes ??
    aggregate.outcomes.map((outcome, index) => ({
      ...outcome,
      dueDate: outcomeKindsByMode[mode][index] === 'ACTION' ? '2026-09-05' : undefined,
      kind: outcomeKindsByMode[mode][index],
      owner: outcomeKindsByMode[mode][index] === 'ACTION' ? 'Casey' : undefined,
    }));
  return aggregate;
}
