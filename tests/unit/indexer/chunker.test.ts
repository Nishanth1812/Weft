import { describe, expect, it } from 'vitest';
import { chunkText } from '../../../src/indexer/chunker.js';

describe('chunkText', () => {
  it('splits source into bounded chunks with overlap and token estimates', () => {
    const text = Array.from({ length: 220 }, (_, i) => `line ${i + 1}`).join('\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.endLine - chunks[0]!.startLine + 1).toBeLessThanOrEqual(150);
    expect(chunks[1]!.startLine).toBeLessThanOrEqual(chunks[0]!.endLine);
    expect(chunks[0]!.tokenEstimate).toBeGreaterThan(0);
  });
  it('splits at extracted symbol boundaries', () => {
    const text = ['preamble', ...Array.from({ length: 20 }, (_, i) => `a${i}`), 'function first() {', ' return 1;', '}', ...Array.from({ length: 20 }, (_, i) => `b${i}`), 'function second() {', ' return 2;', '}'].join('\n');
    const chunks = chunkText(text, [{ name: 'first', kind: 'function', startLine: 22, endLine: 24 }, { name: 'second', kind: 'function', startLine: 45, endLine: 47 }]);
    expect(chunks.map(({ startLine, endLine }) => [startLine, endLine])).toEqual([[1, 21], [22, 44], [45, 47]]);
  });
});
