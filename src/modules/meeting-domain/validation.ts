import type { Result } from '@/modules/shared';
import { isCanonicalUtcTimestamp } from '@/modules/shared';

import {
  meetingModes,
  meetingStatuses,
  preparationStages,
  readinessLevels,
  supportedLocales,
} from './model';
import type { Meeting, MeetingBriefContent, MeetingDomainErrorCode, MeetingReport } from './model';

function failure(): Result<never, MeetingDomainErrorCode> {
  return { error: { code: 'INVALID_MEETING' }, ok: false };
}

function validPositiveInteger(value: number | undefined): boolean {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validBrief(value: unknown): value is MeetingBriefContent & { confirmedAt?: string } {
  if (!isRecord(value)) return false;
  const readiness = value.readiness;
  const facilitation = value.facilitation;
  return (
    typeof value.objective === 'string' &&
    typeof value.desiredOutcome === 'string' &&
    stringArray(value.confirmed) &&
    stringArray(value.assumptions) &&
    stringArray(value.unknowns) &&
    optionalString(value.confirmedAt) &&
    isRecord(readiness) &&
    readinessLevels.includes(readiness.level as never) &&
    Array.isArray(readiness.dimensions) &&
    readiness.dimensions.every(
      (dimension) =>
        isRecord(dimension) &&
        typeof dimension.key === 'string' &&
        dimension.key.trim() !== '' &&
        (dimension.status === 'MISSING' ||
          dimension.status === 'PARTIAL' ||
          dimension.status === 'READY') &&
        optionalString(dimension.summary),
    ) &&
    isRecord(facilitation) &&
    typeof facilitation.openingLine === 'string' &&
    stringArray(facilitation.closingChecklist)
  );
}

function validReport(value: unknown): value is MeetingReport {
  return (
    isRecord(value) &&
    supportedLocales.includes(value.locale as never) &&
    typeof value.markdown === 'string' &&
    typeof value.generatedAt === 'string' &&
    typeof value.sourceUpdatedAt === 'string'
  );
}

export function validateMeeting(meeting: Meeting): Result<Meeting, MeetingDomainErrorCode> {
  if (!isRecord(meeting)) return failure();
  if (
    typeof meeting.id !== 'string' ||
    typeof meeting.title !== 'string' ||
    typeof meeting.rawRequest !== 'string' ||
    (meeting.mode !== undefined && !meetingModes.includes(meeting.mode)) ||
    !optionalString(meeting.modeReason) ||
    !meetingStatuses.includes(meeting.status) ||
    !preparationStages.includes(meeting.preparationStage) ||
    !supportedLocales.includes(meeting.contentLocale) ||
    typeof meeting.scheduledStartAt !== 'string' ||
    typeof meeting.scheduledEndAt !== 'string' ||
    typeof meeting.expectedAttendeeCount !== 'number' ||
    (meeting.actualAttendeeCount !== undefined &&
      typeof meeting.actualAttendeeCount !== 'number') ||
    !optionalString(meeting.startedAt) ||
    !optionalString(meeting.endedAt) ||
    (meeting.activeTopicNodeId !== undefined &&
      (typeof meeting.activeTopicNodeId !== 'string' || meeting.activeTopicNodeId.trim() === '')) ||
    (meeting.brief !== undefined && !validBrief(meeting.brief)) ||
    (meeting.report !== undefined && !validReport(meeting.report)) ||
    (meeting.report !== undefined && meeting.status !== 'ENDED') ||
    typeof meeting.createdAt !== 'string' ||
    typeof meeting.updatedAt !== 'string'
  ) {
    return failure();
  }

  const scheduledStart = Date.parse(meeting.scheduledStartAt);
  const scheduledEnd = Date.parse(meeting.scheduledEndAt);
  const createdAt = Date.parse(meeting.createdAt);
  const updatedAt = Date.parse(meeting.updatedAt);
  const confirmedAt = meeting.brief?.confirmedAt;
  const report = meeting.report;

  if (
    meeting.id.trim() === '' ||
    meeting.title.trim() === '' ||
    meeting.rawRequest.trim() === '' ||
    !validPositiveInteger(meeting.expectedAttendeeCount) ||
    !isCanonicalUtcTimestamp(meeting.scheduledStartAt) ||
    !isCanonicalUtcTimestamp(meeting.scheduledEndAt) ||
    scheduledEnd <= scheduledStart ||
    !isCanonicalUtcTimestamp(meeting.createdAt) ||
    !isCanonicalUtcTimestamp(meeting.updatedAt) ||
    updatedAt < createdAt ||
    (meeting.mode === undefined && meeting.modeReason !== undefined) ||
    (confirmedAt !== undefined &&
      (!isCanonicalUtcTimestamp(confirmedAt) ||
        Date.parse(confirmedAt) < createdAt ||
        Date.parse(confirmedAt) > updatedAt)) ||
    (report !== undefined &&
      (!isCanonicalUtcTimestamp(report.generatedAt) ||
        !isCanonicalUtcTimestamp(report.sourceUpdatedAt) ||
        Date.parse(report.generatedAt) < createdAt ||
        Date.parse(report.sourceUpdatedAt) < createdAt ||
        Date.parse(report.sourceUpdatedAt) > updatedAt ||
        Date.parse(report.generatedAt) > updatedAt ||
        Date.parse(report.sourceUpdatedAt) > Date.parse(report.generatedAt)))
  ) {
    return failure();
  }

  if (
    (meeting.preparationStage === 'DRAFT' &&
      (meeting.mode !== undefined || meeting.brief !== undefined)) ||
    (meeting.preparationStage === 'GRILLING' &&
      (meeting.mode === undefined || meeting.brief !== undefined)) ||
    (meeting.preparationStage === 'BRIEF_READY' &&
      (meeting.mode === undefined || meeting.brief === undefined)) ||
    (meeting.preparationStage === 'MAP_READY' &&
      (meeting.mode === undefined || meeting.brief?.confirmedAt === undefined))
  ) {
    return failure();
  }

  if (meeting.status === 'PREPARING') {
    if (
      meeting.startedAt !== undefined ||
      meeting.endedAt !== undefined ||
      meeting.actualAttendeeCount !== undefined ||
      meeting.activeTopicNodeId !== undefined
    ) {
      return failure();
    }
    return { ok: true, value: meeting };
  }

  const startedAt = meeting.startedAt;

  if (
    meeting.preparationStage !== 'MAP_READY' ||
    !isCanonicalUtcTimestamp(startedAt) ||
    Date.parse(startedAt) < createdAt ||
    Date.parse(startedAt) > updatedAt ||
    !validPositiveInteger(meeting.actualAttendeeCount)
  ) {
    return failure();
  }

  if (meeting.status === 'LIVE') {
    return meeting.endedAt === undefined ? { ok: true, value: meeting } : failure();
  }

  const endedAt = meeting.endedAt;
  return isCanonicalUtcTimestamp(endedAt) &&
    Date.parse(endedAt) >= Date.parse(startedAt) &&
    Date.parse(endedAt) <= updatedAt
    ? { ok: true, value: meeting }
    : failure();
}
