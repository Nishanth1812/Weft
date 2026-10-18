import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkInstructions, syncInstructions } from '../../../src/integrations/instructions.js';

const dirs: string[] = [];
async function target(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'weft-instructions-'));
  dirs.push(dir);
  return join(dir, 'AGENTS.md');
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('managed instructions', () => {
  it('inserts a block and preserves existing content', async () => {
    const path = await target();
    const prefix = 'User guidance\n\n';
    await writeFile(path, prefix);
    const result = await syncInstructions(path, '# Managed');
    expect(result.modified).toBe(true);
    expect(result.content.startsWith(prefix)).toBe(true);
    expect(await readFile(path, 'utf8')).toBe(result.content);
    expect(await checkInstructions(path, '# Managed')).toEqual({ matches: true });
  });

  it('updates only managed text and is idempotent', async () => {
    const path = await target();
    const before = 'Keep this exact.\n<!-- BEGIN WEFT MANAGED BLOCK -->\nold\n<!-- END WEFT MANAGED BLOCK -->\nAnd this.\r\n';
    await writeFile(path, before);
    const updated = await syncInstructions(path, 'new');
    expect(updated.content).toBe('Keep this exact.\n<!-- BEGIN WEFT MANAGED BLOCK -->\nnew\n<!-- END WEFT MANAGED BLOCK -->\nAnd this.\r\n');
    expect((await syncInstructions(path, 'new')).modified).toBe(false);
  });

  it('returns dry run content without writing', async () => {
    const path = await target();
    const result = await syncInstructions(path, 'preview', true);
    expect(result.modified).toBe(true);
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
