import Dexie, { type DexieOptions, type Table } from 'dexie';

import type { GrillTurn, Meeting, MeetingOutcome } from '@/modules/meeting-domain';
import type { MindMapEdge, MindMapNode } from '@/modules/mind-map-domain';

export const meetingDatabaseName = 'convergene';
export const exportSchemaVersion = 1;

export type AppStateKey = 'activeMeetingId' | 'exportSchemaVersion' | 'guideCompleted';

export interface AppStateRecord {
  key: AppStateKey;
  value: boolean | number | string;
}

export class MeetingDatabase extends Dexie {
  declare meetings: Table<Meeting, string>;
  declare nodes: Table<MindMapNode, string>;
  declare edges: Table<MindMapEdge, string>;
  declare outcomes: Table<MeetingOutcome, string>;
  declare grillTurns: Table<GrillTurn, string>;
  declare appState: Table<AppStateRecord, AppStateKey>;

  constructor(name = meetingDatabaseName, options?: DexieOptions) {
    super(name, options);

    this.version(1).stores({
      appState: 'key',
      edges: 'id, meetingId, sourceNodeId, targetNodeId, [meetingId+sourceNodeId]',
      grillTurns: 'id, meetingId, [meetingId+index]',
      meetings: 'id, status, preparationStage, scheduledStartAt, updatedAt',
      nodes: 'id, meetingId, [meetingId+kind], updatedAt',
      outcomes: 'id, meetingId, &[meetingId+nodeId], [meetingId+origin], markedAt',
    });
  }
}
