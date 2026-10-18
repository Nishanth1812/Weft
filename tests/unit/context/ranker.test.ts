import { describe, expect, it } from 'vitest';
import { rankCandidates } from '../../../src/context/ranker.js';
import type { CandidateChunk } from '../../../src/context/types.js';

const candidate = (path: string, extra: Partial<CandidateChunk> = {}): CandidateChunk => ({ path, startLine: 1, endLine: 2, safeText: 'findWidget()', normalizedBM25: 0.8, ...extra });

describe('rankCandidates', () => {
  it('combines weighted lexical and path/symbol signals', () => {
    const ranked = rankCandidates([candidate('src/widget.ts', { symbols: ['findWidget'] }), candidate('src/other.ts')], 'findWidget');
    expect(ranked[0]!.path).toBe('src/widget.ts');
    expect(ranked[0]!.score).toBeCloseTo(0.45 * 0.8 + 0.2);
  });
  it('returns deterministic score and path ordering', () => {
    expect(rankCandidates([candidate('z.ts'), candidate('a.ts')], 'nothing').map(x => x.path)).toEqual(['a.ts', 'z.ts']);
  });
  it('uses graph, paired test, and matching intent signals', () => {
    const results = rankCandidates([
      candidate('src/widget.ts', { graphProximity: 1 }),
      candidate('tests/widget.test.ts'),
      candidate('intent.md', { safeText: 'find widget integration objective', normalizedBM25: 0.2 }),
    ], 'find widget');
    expect(results.find(item => item.path === 'src/widget.ts')!.score).toBeCloseTo(0.45 * 0.8 + 0.2 + 0.15 + 0.1);
    expect(results.find(item => item.path === 'tests/widget.test.ts')!.score).toBeCloseTo(0.45 * 0.8 + 0.2 + 0.1);
    expect(results.find(item => item.path === 'intent.md')!.score).toBeCloseTo(0.45 * 0.2 + 0.1);
  });
});
