import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { walkRepository } from '../../../src/indexer/walker.js';

describe('walkRepository', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'weft-walker-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('discovers source files and respects gitignore and sensitive paths', async () => {
    await mkdir(join(root, '.ssh'));
    await mkdir(join(root, 'src', 'generated'), { recursive: true });
    await writeFile(join(root, '.gitignore'), 'ignored/\n*.log\n!keep.log\n');
    await writeFile(join(root, 'src', '.gitignore'), 'generated/\n');
    await writeFile(join(root, 'main.ts'), 'export function run() {}');
    await mkdir(join(root, 'ignored'));
    await writeFile(join(root, 'ignored/a.ts'), 'ignored');
    await writeFile(join(root, 'trace.log'), 'ignored');
    await writeFile(join(root, 'keep.log'), 'allowed');
    await writeFile(join(root, '.ssh/id_rsa'), 'private');
    await writeFile(join(root, 'src/generated/out.ts'), 'ignored');
    await writeFile(join(root, 'secret.ts'), 'const password = "secret-value";');
    await writeFile(join(root, 'large.ts'), Buffer.alloc(2 * 1024 * 1024 + 1));
    const files = await walkRepository(root);
    expect(files.map(({ path }) => path)).toEqual(['keep.log', 'main.ts', 'secret.ts']);
    expect(files.find(({ path }) => path === 'secret.ts')?.content).toContain('[REDACTED_SECRET:generic-credential]');
  });

  it('reuses cached hashes without reading unchanged files', async () => {
    const file = join(root, 'same.ts');
    await writeFile(file, 'export const same = 1;');
    const { size } = await import('node:fs/promises').then(({ stat }) => stat(file));
    const { mtimeMs } = await import('node:fs/promises').then(({ stat }) => stat(file));
    const files = await walkRepository(root, new Map([['same.ts', { mtimeMs: Math.round(mtimeMs), sizeBytes: size, hash: 'cached' }]]));
    expect(files[0]).toMatchObject({ content: '', contentHash: 'cached', unchanged: true });
  });

  it('skips binary and oversized files, handles BOM and unicode paths, and counts skips', async () => {
    await writeFile(join(root, 'binary.dat'), Buffer.from([0, 1, 2]));
    await writeFile(join(root, 'large.ts'), Buffer.alloc(2 * 1024 * 1024 + 1, 65));
    await writeFile(join(root, 'café.ts'), '\uFEFFexport const café = 1;\r\n');
    const warnings = { count: 0 };
    const files = await walkRepository(root, new Map(), () => warnings.count++);
    expect(files.map(file => file.path)).toContain('café.ts');
    expect(files.find(file => file.path === 'café.ts')?.content).toMatch(/^export/);
    expect(files.map(file => file.path)).not.toContain('binary.dat');
    expect(files.map(file => file.path)).not.toContain('large.ts');
    expect(warnings.count).toBe(2);
  });

  it('does not follow symlink loops and degrades when the registered root disappears', async () => {
    await writeFile(join(root, 'safe.ts'), 'export const safe = true;');
    try { await symlink(root, join(root, 'loop'), 'junction'); } catch { /* Symlink creation may be restricted by the host. */ }
    expect((await walkRepository(root)).map(file => file.path)).toContain('safe.ts');
    const gone = join(root, 'gone');
    await mkdir(gone);
    await rm(gone, { recursive: true });
    const warnings = { count: 0 };
    await expect(walkRepository(gone, new Map(), () => warnings.count++)).resolves.toEqual([]);
    expect(warnings.count).toBe(1);
  });
});
