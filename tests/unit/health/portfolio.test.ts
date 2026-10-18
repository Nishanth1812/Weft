import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runGit } from '../../../src/core/gitstate/gitRunner.js';
import { generatePortfolioSummary } from '../../../src/health/portfolio.js';

const roots: string[] = [];
async function makeRepo(name: string, marker: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `weft-${name}-`));
  roots.push(root);
  await runGit(root, ['init', '-b', 'main']);
  await runGit(root, ['config', 'user.email', 'test@example.com']);
  await runGit(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'source.ts'), marker);
  await runGit(root, ['add', 'source.ts']);
  await runGit(root, ['commit', '-m', 'initial']);
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('generatePortfolioSummary', () => {
  it('aggregates health across repositories', async () => {
    const first = await makeRepo('portfolio-a', '// TODO');
    const second = await makeRepo('portfolio-b', '// FIXME\n// TODO');
    const summary = await generatePortfolioSummary([
      { name: 'a', rootPath: first, registeredAt: 'now' },
      { name: 'b', rootPath: second, registeredAt: 'now' },
    ]);
    expect(summary.totals).toEqual({ repositories: 2, unmergedBranches: 0, staleBranches: 0, todoCount: 3, dirtyFilesCount: 0 });
  });
});
