'use client';

import { useEffect, useState } from 'react';

export function useLiveClock(fixedNow?: Date): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (fixedNow !== undefined) return;

    const interval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, [fixedNow]);

  return fixedNow === undefined ? now : new Date(fixedNow.getTime());
}

export function formatElapsedClock(startedAt: string, now: Date): string {
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - Date.parse(startedAt)) / 1_000));
  const hours = Math.floor(elapsedSeconds / 3_600);
  const minutes = Math.floor((elapsedSeconds % 3_600) / 60);
  const seconds = elapsedSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}
