import { describe, expect, it } from 'vitest';

import { formatExpandServerTiming } from './expand-node-timing';

describe('expand node server timing', () => {
  it('formats only fixed safe stage names and non-negative durations', () => {
    expect(
      formatExpandServerTiming(10, { config: 22.24, provider: 1_203.04, rate: -3 }, () => 1_250.06),
    ).toBe('expand;dur=1240.1, rate;dur=0.0, config;dur=22.2, provider;dur=1203.0');
  });

  it('omits stages that did not begin before a failure', () => {
    expect(formatExpandServerTiming(5, { rate: 8 }, () => 20)).toBe(
      'expand;dur=15.0, rate;dur=8.0',
    );
  });
});
