import type { Meeting, MeetingMode, SupportedLocale } from '@/modules/meeting-domain';
import { validateMeeting } from '@/modules/meeting-domain';

export interface LocalMeetingDraftInput {
  contentLocale: SupportedLocale;
  expectedAttendeeCount: number;
  rawRequest: string;
  scheduledEndAt: string;
  scheduledStartAt: string;
  title: string;
}

export function buildLocalMeetingDraft(
  input: LocalMeetingDraftInput,
  now: Date,
  id = crypto.randomUUID(),
): Meeting {
  const timestamp = now.toISOString();
  const meeting: Meeting = {
    contentLocale: input.contentLocale,
    createdAt: timestamp,
    expectedAttendeeCount: input.expectedAttendeeCount,
    id,
    preparationStage: 'DRAFT',
    rawRequest: input.rawRequest.trim(),
    scheduledEndAt: input.scheduledEndAt,
    scheduledStartAt: input.scheduledStartAt,
    status: 'PREPARING',
    title: input.title.trim(),
    updatedAt: timestamp,
  };

  if (!validateMeeting(meeting).ok) {
    throw new RangeError('Invalid local meeting draft');
  }
  return meeting;
}

export interface MeetingRecommendation {
  mode: MeetingMode;
  reason?: string;
  title: string;
}
