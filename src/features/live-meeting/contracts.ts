import type { Result } from '@/modules/shared';
import type { MarkOutcomeInput, Meeting, MeetingOutcome } from '@/modules/meeting-domain';
import type { MeetingRepositoryErrorCode, OutcomeMetadataPatch } from '@/modules/meeting-db';

export type LiveMeetingCommandResult<Value> = Result<Value, MeetingRepositoryErrorCode>;

export interface StartMeetingCommand {
  (attendeeCount: number): Promise<LiveMeetingCommandResult<Meeting>>;
}

export interface EndMeetingCommand {
  (attendeeCount: number): Promise<LiveMeetingCommandResult<Meeting>>;
}

export interface MarkOutcomeCommand {
  (input: MarkOutcomeInput): Promise<LiveMeetingCommandResult<MeetingOutcome>>;
}

export interface UnmarkOutcomeCommand {
  (outcomeId: string): Promise<LiveMeetingCommandResult<MeetingOutcome>>;
}

export interface UpdateOutcomeCommand {
  (
    outcomeId: string,
    patch: OutcomeMetadataPatch,
  ): Promise<LiveMeetingCommandResult<MeetingOutcome>>;
}

export function meetingCommandErrorKey(code: MeetingRepositoryErrorCode): string {
  switch (code) {
    case 'ACTIVE_MEETING_EXISTS':
      return 'errors.activeMeetingExists';
    case 'INVALID_ATTENDEE_COUNT':
      return 'errors.invalidAttendeeCount';
    case 'INVALID_MEETING_STATE':
      return 'errors.invalidMeetingState';
    case 'INVALID_TIME_RANGE':
      return 'errors.invalidTimeRange';
    case 'OUTCOME_ALREADY_EXISTS':
      return 'errors.outcomeAlreadyExists';
    case 'STALE_WRITE':
      return 'errors.staleWrite';
    default:
      return 'errors.generic';
  }
}
