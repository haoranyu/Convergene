import type { MarkOutcomeInput, Meeting, MeetingOutcome } from '@/modules/meeting-domain';
import type {
  MeetingRepository,
  MeetingRepositoryErrorCode,
  OutcomeMetadataPatch,
} from '@/modules/meeting-db';
import type { Result } from '@/modules/shared';

import type {
  EndMeetingCommand,
  MarkOutcomeCommand,
  StartMeetingCommand,
  UnmarkOutcomeCommand,
  UpdateOutcomeCommand,
} from './contracts';

export interface LiveMeetingCommands {
  end: EndMeetingCommand;
  markOutcome: MarkOutcomeCommand;
  start: StartMeetingCommand;
  unmarkOutcome: UnmarkOutcomeCommand;
  updateOutcome: UpdateOutcomeCommand;
}

export interface LiveMeetingRepositoryPort {
  endMeeting(
    meetingId: string,
    expectedUpdatedAt: string,
    now: Date,
    attendeeCount?: number,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>>;
  markOutcome(
    meetingId: string,
    input: MarkOutcomeInput,
    expectedUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingOutcome, MeetingRepositoryErrorCode>>;
  startMeeting(
    meetingId: string,
    attendeeCount: number,
    expectedUpdatedAt: string,
    now: Date,
  ): Promise<Result<Meeting, MeetingRepositoryErrorCode>>;
  unmarkOutcome(
    meetingId: string,
    outcomeId: string,
    expectedUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingOutcome, MeetingRepositoryErrorCode>>;
  updateOutcomeMetadata(
    meetingId: string,
    outcomeId: string,
    patch: OutcomeMetadataPatch,
    expectedUpdatedAt: string,
    now: Date,
  ): Promise<Result<MeetingOutcome, MeetingRepositoryErrorCode>>;
}

type MeetingRepositoryCompatibility = MeetingRepository extends LiveMeetingRepositoryPort
  ? true
  : never;
const meetingRepositoryCompatibility: MeetingRepositoryCompatibility = true;
void meetingRepositoryCompatibility;

/**
 * Adapts the IndexedDB repository to leaf UI callbacks. Recreate this adapter
 * whenever the observed meeting revision changes; a superseded adapter will
 * fail with STALE_WRITE instead of overwriting another tab.
 */
export function createLiveMeetingCommands(
  repository: LiveMeetingRepositoryPort,
  meeting: Pick<Meeting, 'id' | 'updatedAt'>,
  now: () => Date = () => new Date(),
): LiveMeetingCommands {
  const meetingId = meeting.id;
  const expectedUpdatedAt = meeting.updatedAt;

  return {
    end: (attendeeCount) =>
      repository.endMeeting(meetingId, expectedUpdatedAt, now(), attendeeCount),
    markOutcome: (input) => repository.markOutcome(meetingId, input, expectedUpdatedAt, now()),
    start: (attendeeCount) =>
      repository.startMeeting(meetingId, attendeeCount, expectedUpdatedAt, now()),
    unmarkOutcome: (outcomeId) =>
      repository.unmarkOutcome(meetingId, outcomeId, expectedUpdatedAt, now()),
    updateOutcome: (outcomeId, patch) =>
      repository.updateOutcomeMetadata(meetingId, outcomeId, patch, expectedUpdatedAt, now()),
  };
}
