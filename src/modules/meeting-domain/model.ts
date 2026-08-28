export const meetingModes = ['DECISION', 'BRAINSTORM', 'RETRO', 'GENERAL'] as const;
export type MeetingMode = (typeof meetingModes)[number];

export const meetingStatuses = ['PREPARING', 'LIVE', 'ENDED'] as const;
export type MeetingStatus = (typeof meetingStatuses)[number];

export type TimingState = 'BEFORE_SCHEDULE' | 'WITHIN_SCHEDULE' | 'OVERRUN' | 'FINISHED';

export interface MeetingTiming {
  endedAt?: string;
  scheduledEndAt: string;
  scheduledStartAt: string;
  status: MeetingStatus;
}
