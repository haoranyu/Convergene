import { describe, expect, it } from 'vitest';

import { briefSnapshot, createMapReadyMeeting, createMeeting } from '@/fixtures/meeting';

import { validateMeeting } from './validation';

describe('meeting persistence validation', () => {
  it('requires canonical UTC timestamps for meeting, Brief, and report records', () => {
    expect(
      validateMeeting(createMeeting({ scheduledStartAt: '2026-08-29T18:00:00+08:00' })),
    ).toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
    expect(
      validateMeeting(
        createMapReadyMeeting({
          brief: { ...briefSnapshot, confirmedAt: '2026-08-29T17:30:00+08:00' },
        }),
      ),
    ).toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
    expect(
      validateMeeting(
        createMapReadyMeeting({
          report: {
            generatedAt: '2026-08-29T18:00:00+08:00',
            locale: 'en-US',
            markdown: '# Report',
            sourceUpdatedAt: '2026-08-29T09:00:00.000Z',
          },
        }),
      ),
    ).toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
  });

  it('rejects unsupported enums and malformed nested records without throwing', () => {
    expect(
      validateMeeting(
        createMeeting({ contentLocale: 'fr-FR' } as unknown as Partial<
          ReturnType<typeof createMeeting>
        >),
      ),
    ).toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
    expect(
      validateMeeting(
        createMeeting({ status: 'PAUSED' } as unknown as Partial<ReturnType<typeof createMeeting>>),
      ),
    ).toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
    expect(
      validateMeeting(
        createMapReadyMeeting({
          brief: {
            ...briefSnapshot,
            readiness: { dimensions: null, level: 'READY' },
          },
        } as unknown as Parameters<typeof createMapReadyMeeting>[0]),
      ),
    ).toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
    expect(
      validateMeeting(
        createMapReadyMeeting({
          report: {
            generatedAt: '2026-08-29T09:30:00.000Z',
            locale: 'fr-FR',
            markdown: '# Report',
            sourceUpdatedAt: '2026-08-29T09:30:00.000Z',
          },
        } as unknown as Parameters<typeof createMapReadyMeeting>[0]),
      ),
    ).toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
  });

  it('rejects reports on meetings that have not ended', () => {
    expect(
      validateMeeting(
        createMapReadyMeeting({
          report: {
            generatedAt: '2026-08-29T09:30:00.000Z',
            locale: 'en-US',
            markdown: '# Premature report',
            sourceUpdatedAt: '2026-08-29T09:30:00.000Z',
          },
        }),
      ),
    ).toMatchObject({ error: { code: 'INVALID_MEETING' }, ok: false });
  });
});
