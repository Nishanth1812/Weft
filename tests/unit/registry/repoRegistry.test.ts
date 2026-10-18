import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fuzzyFindRepo, registerRepo } from '../../../src/core/registry/repoRegistry.js';
import { runGit } from '../../../src/core/gitstate/gitRunner.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });
describe('repo registry', () => {
  it('requires git roots, normalizes and avoids duplicate paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weft-repo-')); dirs.push(root); await runGit(root, ['init']);
    const repos: Awaited<ReturnType<typeof registerRepo>>[] = [];
    const first = await registerRepo(root, repos, 'Sample');
    expect(await registerRepo(root, repos, 'Sample')).toEqual(first);
    expect(first.rootPath.replace(/\\/g, '/')).toContain(root.replace(/\\/g, '/'));
    const gitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = join(root, 'missing-git-dir');
    try { await expect(registerRepo(tmpdir(), repos)).rejects.toThrow(/git/i); }
    finally { if (gitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = gitDir; }
  });
  it('returns deterministic name matches and candidates', () => {
    const repos = [{ name: 'alpha-api', rootPath: '/alpha', registeredAt: 'x' }, { name: 'alpha-web', rootPath: '/web', registeredAt: 'x' }, { name: 'notes', rootPath: '/notes', registeredAt: 'x' }];
    expect(fuzzyFindRepo('alpha', repos)).toEqual({ match: null, candidates: [repos[0], repos[1]] });
    expect(fuzzyFindRepo('notes', repos).match).toBe(repos[2]);
  });
});
