import type { Meeting } from '@/modules/meeting-domain';

export type MeetingGroupId = 'active' | 'waiting' | 'preparing' | 'ended';

export interface MeetingGroup {
  id: MeetingGroupId;
  meetings: Meeting[];
}

const groupOrder: MeetingGroupId[] = ['active', 'waiting', 'preparing', 'ended'];

export function groupMeetings(meetings: readonly Meeting[]): MeetingGroup[] {
  const grouped: Record<MeetingGroupId, Meeting[]> = {
    active: [],
    ended: [],
    preparing: [],
    waiting: [],
  };

  for (const meeting of meetings) {
    if (meeting.status === 'LIVE') {
      grouped.active.push(meeting);
    } else if (meeting.status === 'ENDED') {
      grouped.ended.push(meeting);
    } else if (meeting.preparationStage === 'MAP_READY') {
      grouped.waiting.push(meeting);
    } else {
      grouped.preparing.push(meeting);
    }
  }

  return groupOrder.map((id) => ({ id, meetings: grouped[id] }));
}

export function staleLiveMeetings(meetings: readonly Meeting[], now: Date): Meeting[] {
  const timestamp = now.getTime();
  return meetings.filter(
    (meeting) =>
      meeting.status === 'LIVE' &&
      Number.isFinite(timestamp) &&
      timestamp > Date.parse(meeting.scheduledEndAt),
  );
}
