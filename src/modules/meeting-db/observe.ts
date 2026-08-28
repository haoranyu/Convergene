import { liveQuery } from 'dexie';

import type { Meeting } from '@/modules/meeting-domain';

import type { MeetingDatabase } from './database';
import {
  MeetingReadError,
  readMeetingAggregate,
  readMeetings,
  type MeetingAggregate,
} from './read';

export function observeMeetings(
  database: MeetingDatabase,
  onMeetings: (meetings: Meeting[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const subscription = liveQuery(() => readMeetings(database)).subscribe({
    error: onError,
    next: (result) => {
      if (result.ok) {
        onMeetings(result.value);
        return;
      }
      // Keep the live query subscribed so a later repair can emit a valid projection.
      onError?.(new MeetingReadError());
    },
  });

  return () => subscription.unsubscribe();
}

export function observeMeetingAggregate(
  database: MeetingDatabase,
  meetingId: string,
  onAggregate: (aggregate: MeetingAggregate | undefined) => void,
  onError?: (error: unknown) => void,
): () => void {
  const subscription = liveQuery(() => readMeetingAggregate(database, meetingId)).subscribe({
    error: onError,
    next: (result) => {
      if (result.ok) {
        onAggregate(result.value);
        return;
      }
      // Keep the live query subscribed so a later repair can emit a valid projection.
      onError?.(new MeetingReadError());
    },
  });

  return () => subscription.unsubscribe();
}
