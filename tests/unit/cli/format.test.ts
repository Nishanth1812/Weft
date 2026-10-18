import { describe, expect, it } from 'vitest';
import { formatContext, formatSearch } from '../../../src/cli/format.js';

describe('compact CLI formatting', () => {
  const item = { path: 'src/file.ts', startLine: 4, endLine: 6, symbols: ['unrelated', 'target'], safeText: 'export function target() {\n  return 1;\n}' };
  it('prints a location and first line for search', () => {
    expect(formatSearch([item])).toBe('src/file.ts:4-6  target\nexport function target() {');
  });
  it('prints raw code for context without JSON escaping', () => {
    expect(formatContext([item])).toContain('src/file.ts:4-6  target\nexport function target() {\n  return 1;');
    expect(formatContext([item])).not.toContain('\\n');
  });
});
