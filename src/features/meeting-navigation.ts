import type { Meeting } from '@/modules/meeting-domain';

type NavigableMeeting = Pick<Meeting, 'id' | 'preparationStage' | 'status'>;

export function meetingHref(meeting: NavigableMeeting): string {
  const path = `/meetings/${meeting.id}`;
  return meeting.status === 'PREPARING' && meeting.preparationStage !== 'MAP_READY'
    ? `${path}/prepare`
    : path;
}
