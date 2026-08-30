export const expandTimingStages = ['rate', 'config', 'provider'] as const;

export type ExpandTimingStage = (typeof expandTimingStages)[number];

export function formatExpandServerTiming(
  startedAt: number,
  timings: Partial<Record<ExpandTimingStage, number>>,
  now = performance.now.bind(performance),
): string {
  const metrics = [`expand;dur=${Math.max(0, now() - startedAt).toFixed(1)}`];
  for (const stage of expandTimingStages) {
    const duration = timings[stage];
    if (duration !== undefined && Number.isFinite(duration)) {
      metrics.push(`${stage};dur=${Math.max(0, duration).toFixed(1)}`);
    }
  }
  return metrics.join(', ');
}
