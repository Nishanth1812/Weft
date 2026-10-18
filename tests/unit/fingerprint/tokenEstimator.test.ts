import { describe, expect, it } from 'vitest';
import { estimateTokens, fitsBudget } from '../../../src/core/estimate/tokenEstimator.js';

describe('tokenEstimator', () => {
  it('estimates zero and standard code conservatively', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('const answer = 42;')).toBe(5);
  });

  it('uses a ceiling at budget boundaries', () => {
    expect(estimateTokens('1234')).toBe(2);
    expect(fitsBudget('1234', 2)).toBe(true);
    expect(fitsBudget('1234', 1)).toBe(false);
    expect(fitsBudget('', 0)).toBe(true);
  });
});
