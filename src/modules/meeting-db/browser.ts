'use client';

import { MeetingDatabase } from './database';

let browserDatabase: MeetingDatabase | undefined;

export function getBrowserMeetingDatabase(): MeetingDatabase {
  browserDatabase ??= new MeetingDatabase();
  return browserDatabase;
}
