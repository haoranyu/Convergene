import type { Meeting, MeetingBriefDraft, MeetingBriefSnapshot } from '@/modules/meeting-domain';

export const briefDraft: MeetingBriefDraft = {
  assumptions: ['The decision can be made in one meeting'],
  confirmed: ['The sponsor will attend'],
  desiredOutcome: 'Choose an option',
  facilitation: {
    closingChecklist: ['Name the selected option'],
    openingLine: 'We are here to choose.',
  },
  objective: 'Choose the launch plan',
  readiness: {
    dimensions: [
      'objective',
      'desired_outcome',
      'participants_and_authority',
      'inputs',
      'constraints',
      'minimum_outcome',
      'decision_owner',
      'options',
      'criteria',
      'decision_deadline',
    ].map((key) => ({ key, status: key === 'objective' ? 'READY' : 'MISSING' })),
    level: 'BARELY_READY',
  },
  unknowns: ['Final budget'],
};

export const briefSnapshot: MeetingBriefSnapshot = {
  ...briefDraft,
  confirmedAt: '2026-08-29T09:30:00.000Z',
};

export function createMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    contentLocale: 'en-US',
    createdAt: '2026-08-29T09:00:00.000Z',
    expectedAttendeeCount: 4,
    id: 'meeting-1',
    preparationStage: 'DRAFT',
    rawRequest: 'Choose a launch plan',
    scheduledEndAt: '2026-08-29T11:00:00.000Z',
    scheduledStartAt: '2026-08-29T10:00:00.000Z',
    status: 'PREPARING',
    title: 'Launch decision',
    updatedAt: '2026-08-29T09:00:00.000Z',
    ...overrides,
  };
}

export function createMapReadyMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return createMeeting({
    brief: briefSnapshot,
    mode: 'DECISION',
    preparationStage: 'MAP_READY',
    updatedAt: briefSnapshot.confirmedAt,
    ...overrides,
  });
}
