import { describe, expect, it } from 'vitest';
import { packContext } from '../../../src/context/packer.js';
import type { RankedChunk } from '../../../src/context/types.js';

const chunk = (path: string, safeText: string, score = 1): RankedChunk => ({ path, startLine: 1, endLine: 1, safeText, score, selectionReason: 'lexical' });

describe('packContext', () => {
  it.each([2048, 4096])('never exceeds the %i token budget', budget => {
    const result = packContext([chunk('b.ts', 'x'.repeat(10000)), chunk('a.ts', 'x'.repeat(7300)), chunk('c.ts', 'x'.repeat(100))], budget, 'query');
    expect(result.estimatedTokens).toBeLessThanOrEqual(budget);
    expect(result.items.every(item => item.estimatedTokens > 0)).toBe(true);
    expect(result.isTruncated).toBe(true);
    expect(result.omittedCount).toBe(1);
  });
  it('sorts deterministically without mutating candidate order', () => {
    const input = [chunk('z.ts', 'ok'), chunk('a.ts', 'ok')];
    expect(packContext(input, 20, 'q').items.map(item => item.path)).toEqual(['a.ts', 'z.ts']);
    expect(input[0]!.path).toBe('z.ts');
  });
});
