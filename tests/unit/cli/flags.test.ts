import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { KNOWN_FLAGS } from '../../../src/cli/commands/index.js';

describe('CLI flag validation', () => {
  it('accepts every long flag the command implementations read', async () => {
    const source = await readFile(new URL('../../../src/cli/commands/index.ts', import.meta.url), 'utf8');
    const used = new Set([...source.matchAll(/(?:includes\(|option\((?:rest|args), ?)'(--[a-z-]+)'/g)].map((match) => match[1]!));
    expect([...used].filter((flag) => !KNOWN_FLAGS.has(flag))).toEqual([]);
  });
});
