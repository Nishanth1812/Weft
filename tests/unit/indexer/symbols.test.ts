import { describe, expect, it } from 'vitest';
import { extractSymbols } from '../../../src/indexer/symbols.js';

describe('extractSymbols', () => {
  it('extracts top-level declarations for TypeScript, Python, and Go', () => {
    expect(extractSymbols('export function run() {\n return 1;\n}\nclass Worker {}', 'x.ts')).toMatchObject([
      { name: 'run', kind: 'function', startLine: 1 }, { name: 'Worker', kind: 'class', startLine: 4 },
    ]);
    expect(extractSymbols('def run():\n    pass\n\nclass Worker:', 'x.py').map(({ name, kind }) => [name, kind])).toEqual([['run', 'function'], ['Worker', 'class']]);
    expect(extractSymbols('func Run() {}\ntype Worker struct {}', 'x.go').map(({ name, kind }) => [name, kind])).toEqual([['Run', 'function'], ['Worker', 'type']]);
  });
  it('does not report control flow keywords as symbols', () => {
    const source = 'function run() {\n if (ok) { work(); }\n for (const x of xs) { use(x); }\n while (pending) { wait(); }\n switch (kind) { case 1: break; }\n try { work(); } catch (error) { fail(error); }\n}';
    expect(extractSymbols(source, 'x.ts').map(({ name }) => name)).toEqual(['run']);
  });
});
