import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { runVerification } from '../../../src/verification/runner.js';
import { suggestChecks } from '../../../src/verification/suggest.js';

const dirs: string[] = [];
async function fixture() { const dir = await mkdtemp(join(tmpdir(), 'weft-verify-')); dirs.push(dir); execFileSync('git', ['init', '--quiet', dir]); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('runVerification', () => {
  it('captures passing and failing output, retaining the tail', async () => {
    const root = await fixture();
    expect(await runVerification(root, 'echo pass')).toMatchObject({ exitCode: 0, outputTail: expect.stringContaining('pass') });
    const failure = await runVerification(root, 'echo first & echo last failure & exit /b 7');
    expect(failure).toMatchObject({ exitCode: 7 });
    expect(failure.outputTail).toContain('last failure');
  });
  it('returns timeout as a failed record', async () => {
    const record = await runVerification(await fixture(), 'node -e "setTimeout(() => {}, 5000)"', { timeoutMs: 30 });
    expect(record.exitCode).toBe(124);
  });
  it('redacts secrets from output', async () => {
    const secret = `ghp_${'a'.repeat(40)}`;
    const record = await runVerification(await fixture(), `echo ${secret}`);
    expect(record.outputTail).not.toContain(secret);
  });
  it('records changed files from git status', async () => {
    const root = await fixture();
    await writeFile(join(root, 'changed.ts'), 'export {};');
    expect((await runVerification(root, 'echo ok')).changedFiles).toContain('changed.ts');
  });
});

it('suggests scripts and matching test files deterministically', async () => {
  const root = await fixture();
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run', lint: 'eslint', build: 'tsc' }, devDependencies: { vitest: '3' } }));
  await mkdir(join(root, 'tests'), { recursive: true });
  await mkdir(join(root, 'tests', 'unit'), { recursive: true });
  await writeFile(join(root, 'tests', 'unit', 'widget.test.ts'), '');
  expect(await suggestChecks(root, ['src/widget.ts'])).toEqual(['npx vitest run tests/unit/widget.test.ts', 'npm run test', 'npm run lint', 'npm run build']);
});
