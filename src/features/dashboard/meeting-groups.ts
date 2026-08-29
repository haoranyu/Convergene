import { deriveTimingState, type Meeting } from '@/modules/meeting-domain';

export type MeetingGroupId = 'active' | 'waiting' | 'preparing' | 'ended';

export interface MeetingGroup {
  id: MeetingGroupId;
  meetings: Meeting[];
}

const groupOrder: MeetingGroupId[] = ['active', 'waiting', 'preparing', 'ended'];

export function groupMeetings(meetings: readonly Meeting[], now: Date): MeetingGroup[] {
  const grouped: Record<MeetingGroupId, Meeting[]> = {
    active: [],
    ended: [],
    preparing: [],
    waiting: [],
  };

  for (const meeting of meetings) {
    const timingState = deriveTimingState(meeting, now);
    if (timingState === 'LIVE' || timingState === 'LIVE_OVERRUN') {
      grouped.active.push(meeting);
    } else if (timingState === 'ENDED_ON_TIME' || timingState === 'ENDED_OVERRUN') {
      grouped.ended.push(meeting);
    } else if (meeting.preparationStage === 'MAP_READY' && timingState === 'WAITING_TO_START') {
      grouped.waiting.push(meeting);
    } else {
      grouped.preparing.push(meeting);
    }
  }

  return groupOrder.map((id) => ({ id, meetings: grouped[id] }));
}

export function staleLiveMeetings(meetings: readonly Meeting[], now: Date): Meeting[] {
  return meetings.filter((meeting) => deriveTimingState(meeting, now) === 'LIVE_OVERRUN');
}
