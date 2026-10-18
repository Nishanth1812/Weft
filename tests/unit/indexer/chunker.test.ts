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
});
