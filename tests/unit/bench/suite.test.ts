import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { applySuitePatches, loadSuite } from '../../../src/bench/live.js';
import { runCommand } from '../../../src/cli/commands/index.js';

function run(command: string, cwd: string): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'ignore' });
    child.once('error', () => resolvePromise(1));
    child.once('close', (code) => resolvePromise(code ?? 1));
  });
}

describe('Weft core benchmark suite', () => {
  it('prints a dry-run estimate and requires --yes before a live run', async () => {
    const args = ['bench', 'run', '--suite', 'tests/benchmarks/suites/weft-core.json', '--harness', 'stub {prompt}', '--repeat', '3'];
    const preview = await runCommand([...args, '--dry-run']);
    expect(preview.data).toContain('10 tasks × 3 conditions × 3 repeats');
    expect(preview.data).toContain('1,368,000');
    await expect(runCommand(args)).rejects.toThrow('--yes');
  });

  it('validates ten tasks and proves each acceptance check fails before and passes after its reference patch', async () => {
    const tasks = await loadSuite(resolve('tests/benchmarks/suites/weft-core.json'));
    expect(tasks).toHaveLength(10);
    expect(Object.fromEntries(['bugfix', 'feature', 'refactor', 'comprehension'].map((category) => [category, tasks.filter((task) => task.category === category).length])))
      .toEqual({ bugfix: 4, feature: 3, refactor: 2, comprehension: 1 });

    for (const task of tasks) {
      const work = await mkdtemp(join(tmpdir(), 'weft-suite-check-'));
      const repo = join(work, 'repo');
      try {
        await cp(resolve('.'), repo, { recursive: true, filter: (source) => !/[\\/](?:\.git|node_modules|dist|coverage)(?:[\\/]|$)/.test(source) });
        await applySuitePatches(repo, task.setup);
        expect(await run(task.testCommand, repo), `${task.id} should fail before its solution`).not.toBe(0);
        await applySuitePatches(repo, task.solution);
        expect(await run(task.testCommand, repo), `${task.id} should pass after its solution`).toBe(0);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }
  }, 120_000);
});
