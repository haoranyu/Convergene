'use client';

import { useMemo } from 'react';

import { MeetingDatabase, MeetingRepository, type MeetingAggregate } from '@/modules/meeting-db';

import { createMeetingReportCommand } from './commands';
import { ReportWorkspaceView } from './report-workspace';

let reportRepository: MeetingRepository | undefined;

function getReportRepository(): MeetingRepository {
  reportRepository ??= new MeetingRepository(new MeetingDatabase());
  return reportRepository;
}

export interface ReportWorkspaceProps {
  aggregate: MeetingAggregate;
  timezone: string;
}

/** Serializable client boundary for the future Issue #8 meeting route. */
export function ReportWorkspace({ aggregate, timezone }: ReportWorkspaceProps) {
  const repository = getReportRepository();
  const generate = useMemo(
    () => createMeetingReportCommand(repository, aggregate, { timezone }),
    [aggregate, repository, timezone],
  );

  return (
    <ReportWorkspaceView
      aggregate={aggregate}
      key={aggregate.meeting.id}
      onGenerate={generate}
      timezone={timezone}
    />
  );
}
