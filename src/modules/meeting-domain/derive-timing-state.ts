import type { MeetingTiming, TimingState } from './model';

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${field} must be a valid ISO timestamp`);
  }

  return parsed;
}

export function deriveTimingState(meeting: MeetingTiming, now: Date): TimingState {
  const nowTimestamp = now.getTime();
  const scheduledStart = timestamp(meeting.scheduledStartAt, 'scheduledStartAt');
  const scheduledEnd = timestamp(meeting.scheduledEndAt, 'scheduledEndAt');

  if (!Number.isFinite(nowTimestamp) || scheduledEnd <= scheduledStart) {
    throw new RangeError('Meeting timing must contain a valid, increasing schedule');
  }

  if (meeting.status === 'ENDED') {
    if (meeting.endedAt === undefined) {
      throw new RangeError('An ended meeting must have endedAt');
    }

    return timestamp(meeting.endedAt, 'endedAt') <= scheduledEnd
      ? 'ENDED_ON_TIME'
      : 'ENDED_OVERRUN';
  }

  if (meeting.status === 'LIVE') {
    return nowTimestamp <= scheduledEnd ? 'LIVE' : 'LIVE_OVERRUN';
  }

  return nowTimestamp < scheduledStart ? 'PREPARING' : 'WAITING_TO_START';
}
