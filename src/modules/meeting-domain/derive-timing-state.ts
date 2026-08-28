import type { MeetingTiming, TimingState } from './model';

export function deriveTimingState(meeting: MeetingTiming, now: Date): TimingState {
  if (meeting.status === 'ENDED' || meeting.endedAt) {
    return 'FINISHED';
  }

  const nowTimestamp = now.getTime();
  const scheduledStart = Date.parse(meeting.scheduledStartAt);
  const scheduledEnd = Date.parse(meeting.scheduledEndAt);

  if (nowTimestamp < scheduledStart) {
    return 'BEFORE_SCHEDULE';
  }

  if (nowTimestamp > scheduledEnd) {
    return 'OVERRUN';
  }

  return 'WITHIN_SCHEDULE';
}
