import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runGit } from '../../../src/core/gitstate/gitRunner.js';
import { checkRepoHealth } from '../../../src/health/healthChecker.js';

const repos: string[] = [];
async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'weft-health-'));
  repos.push(root);
  await runGit(root, ['init', '-b', 'main']);
  await runGit(root, ['config', 'user.email', 'test@example.com']);
  await runGit(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'source.ts'), 'const x = "TODO"; // FIXME\n');
  await runGit(root, ['add', 'source.ts']);
  await runGit(root, ['commit', '-m', 'initial']);
  return root;
}
afterEach(async () => { await Promise.all(repos.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('checkRepoHealth', () => {
  it('reports unmerged branches, TODO markers and dirty files', async () => {
    const root = await makeRepo();
    await runGit(root, ['checkout', '-b', 'feature']);
    await writeFile(join(root, 'feature.txt'), 'feature');
    await runGit(root, ['add', 'feature.txt']);
    await runGit(root, ['commit', '-m', 'feature']);
    await runGit(root, ['checkout', 'main']);
    await writeFile(join(root, 'untracked.txt'), 'dirty');
    const report = await checkRepoHealth(root);
    expect(report.unmergedBranches).toContain('feature');
    expect(report.todoCount).toBe(2);
    expect(report.dirtyFilesCount).toBe(1);
  });
});
