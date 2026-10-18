import { describe, expect, it } from 'vitest';
import { calculateCostMicros } from '../../../src/telemetry/pricing.js';

describe('calculateCostMicros', () => {
  it('calculates gpt-4o costs in integer micro-dollars, including cached input', () => {
    expect(calculateCostMicros('gpt-4o', 1_000_000, 1_000_000, 200_000)).toEqual({
      costMicros: 2_000_000 + 250_000 + 10_000_000,
      provenance: 'estimated',
    });
  });

  it('returns unavailable for unknown models', () => {
    expect(calculateCostMicros('unknown-model', 100, 50)).toEqual({ costMicros: null, provenance: 'unavailable' });
  });
});
