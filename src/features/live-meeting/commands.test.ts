import { describe, expect, it, vi } from 'vitest';

import { createMapReadyMeeting } from '@/fixtures/meeting';

import { createLiveMeetingCommands, type LiveMeetingRepositoryPort } from './commands';

describe('live meeting command seam', () => {
  it('binds every command to one observed revision and an explicit clock', async () => {
    const meeting = createMapReadyMeeting();
    const result = { error: { code: 'STALE_WRITE' as const }, ok: false as const };
    const repository: LiveMeetingRepositoryPort = {
      endMeeting: vi.fn().mockResolvedValue(result),
      markOutcome: vi.fn().mockResolvedValue(result),
      startMeeting: vi.fn().mockResolvedValue(result),
      unmarkOutcome: vi.fn().mockResolvedValue(result),
      updateOutcomeMetadata: vi.fn().mockResolvedValue(result),
    };
    const now = new Date('2026-08-29T10:00:00.000Z');
    const commands = createLiveMeetingCommands(repository, meeting, () => new Date(now));

    await commands.start(5);
    await commands.markOutcome({ id: 'outcome-1', kind: 'ACTION', nodeId: 'node-1' });
    await commands.updateOutcome('outcome-1', { owner: 'Casey' });
    await commands.unmarkOutcome('outcome-1');
    await commands.end(6);

    expect(repository.startMeeting).toHaveBeenCalledWith(meeting.id, 5, meeting.updatedAt, now);
    expect(repository.markOutcome).toHaveBeenCalledWith(
      meeting.id,
      { id: 'outcome-1', kind: 'ACTION', nodeId: 'node-1' },
      meeting.updatedAt,
      now,
    );
    expect(repository.updateOutcomeMetadata).toHaveBeenCalledWith(
      meeting.id,
      'outcome-1',
      { owner: 'Casey' },
      meeting.updatedAt,
      now,
    );
    expect(repository.unmarkOutcome).toHaveBeenCalledWith(
      meeting.id,
      'outcome-1',
      meeting.updatedAt,
      now,
    );
    expect(repository.endMeeting).toHaveBeenCalledWith(meeting.id, meeting.updatedAt, now, 6);
  });
});
