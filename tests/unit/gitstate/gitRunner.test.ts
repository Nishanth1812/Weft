import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getGitRoot, getHeadCommit, getUnmergedBranches, getWorkingTreeStatus, runGit } from '../../../src/core/gitstate/gitRunner.js';

const repos: string[] = [];
async function makeRepo(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'weft-git-'));
  repos.push(path);
  await runGit(path, ['init']);
  await runGit(path, ['config', 'user.email', 'test@example.com']);
  await runGit(path, ['config', 'user.name', 'Test']);
  return path;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

describe('gitRunner', () => {
  it('reads repository root, head and a clean status', async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, 'tracked.txt'), 'tracked');
    await runGit(repo, ['add', 'tracked.txt']);
    await runGit(repo, ['commit', '-m', 'initial']);
    const nested = join(repo, 'nested');
    await mkdir(nested);
    expect(await getGitRoot(nested)).toBe(repo);
    expect(await getHeadCommit(repo)).toMatch(/^[0-9a-f]{40,64}$/);
    expect(await getUnmergedBranches(repo)).toEqual([]);
    expect(await getWorkingTreeStatus(repo)).toMatchObject({ staged: [], unstaged: [], untracked: [], clean: true });
  });

  it('parses staged, unstaged and untracked paths from NUL-delimited status', async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, 'tracked.txt'), 'before');
    await runGit(repo, ['add', 'tracked.txt']);
    await runGit(repo, ['commit', '-m', 'initial']);
    await writeFile(join(repo, 'tracked.txt'), 'after');
    await runGit(repo, ['add', 'tracked.txt']);
    await writeFile(join(repo, 'tracked.txt'), 'final');
    await mkdir(join(repo, 'new dir'));
    await writeFile(join(repo, 'new dir', 'file.txt'), 'new');
    expect(await getWorkingTreeStatus(repo)).toMatchObject({
      staged: ['tracked.txt'], unstaged: ['tracked.txt'], untracked: ['new dir/file.txt'], clean: false,
    });
  });

  it('rejects output larger than the configured buffer cap', async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, 'tracked.txt'), 'tracked');
    await runGit(repo, ['add', 'tracked.txt']);
    await runGit(repo, ['commit', '-m', 'initial']);
    await writeFile(join(repo, 'untracked.txt'), 'untracked');
    await expect(runGit(repo, ['status', '--porcelain'], { maxBufferBytes: 1 })).rejects.toThrow(/exceeded 1 byte limit/i);
  });

  it('returns null for a non-repository and rejects a timed out process', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weft-no-git-'));
    repos.push(dir);
    const previousGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = join(dir, 'missing-git-dir');
    try {
      expect(await getGitRoot(dir)).toBeNull();
    } finally {
      if (previousGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
    }
    await expect(runGit(dir, ['-c', 'alias.slow=!node -e "setTimeout(()=>{},300)"', 'slow'], { timeoutMs: 50 })).rejects.toThrow(/timed out/i);
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
});
