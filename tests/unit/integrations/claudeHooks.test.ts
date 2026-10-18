import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { createTask, saveCheckpoint } from '../../../src/memory/taskManager.js';
import { installClaudeHooks, uninstallClaudeHooks, runSessionStartHook, runCheckpointHook } from '../../../src/hooks/claude.js';
import { runHookSafely } from '../../../src/integrations/claude-code/index.js';
import { estimateTokens } from '../../../src/core/estimate/tokenEstimator.js';

const dirs: string[] = [];
async function tempDir() { const dir = await mkdtemp(join(tmpdir(), 'weft-hooks-')); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))); });

describe('Claude Code hooks', () => {
  it('times out safely', async () => {
    expect(await runHookSafely(() => new Promise((resolve) => setTimeout(() => resolve('late'), 100)), 5)).toBeUndefined();
  });

  it('merges settings idempotently and removes only Weft hooks', async () => {
    const project = await tempDir();
    const path = join(project, '.claude', 'settings.json');
    await mkdir(join(project, '.claude'), { recursive: true });
    await writeFile(path, JSON.stringify({ hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'keep me' }] }] } }));
    await installClaudeHooks({ projectRoot: project });
    await installClaudeHooks({ projectRoot: project });
    const installed = JSON.parse(await readFile(path, 'utf8'));
    expect(installed.hooks.SessionStart).toHaveLength(2);
    expect(installed.hooks.Stop).toHaveLength(1);
    expect(installed.hooks.PreCompact).toHaveLength(1);
    await uninstallClaudeHooks({ projectRoot: project });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'keep me' }] }], Stop: [], PreCompact: [] } });
  });

  it('checkpoints git state idempotently and redacts planted secrets', async () => {
    const root = await tempDir();
    const stateDir = join(root, 'state');
    const repo = join(root, 'repo');
    await mkdir(repo);
    const db = openDatabase(stateDir);
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', repo, 'repo', 'now', 'now');
      createTask(db, 'r', 'task');
    } finally { db.close(); }
    const git = async (_root: string, kind: 'status' | 'head') => {
      if (kind === 'status') return { staged: ['src/ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij.ts'], unstaged: [], untracked: [], branch: 'main', clean: false };
      if (kind === 'head') return 'abc123';
      return null;
    };
    await runCheckpointHook({ budgetMs: 20_000, cwd: repo, stateDir, gitState: git, gitRoot: async () => repo });
    await runCheckpointHook({ budgetMs: 20_000, cwd: repo, stateDir, gitState: git, gitRoot: async () => repo });
    const check = openDatabase(stateDir);
    try {
      const rows = check.prepare('SELECT payload_json FROM checkpoints').all() as Array<{ payload_json: string }>;
      expect(rows, await readFile(join(stateDir, 'hooks.log'), 'utf8').catch(() => 'no hook log')).toHaveLength(1);
      expect(rows[0]!.payload_json).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
      expect(rows[0]!.payload_json).toContain('[REDACTED_SECRET:');
      const checkpoint = JSON.parse(rows[0]!.payload_json) as { decisions: string[] };
      expect(checkpoint.decisions[0]).toContain('"branch":"main"');
      expect(checkpoint.decisions[0]).toContain('"lastCommit":"abc123"');
      expect(checkpoint.decisions[0]).toContain('src/[REDACTED_SECRET:github-token].ts');
    } finally { check.close(); }
  });

  it('prints a compact context and its estimated token count for a registered repo', async () => {
    const root = await tempDir();
    const stateDir = join(root, 'state');
    const repo = join(root, 'repo');
    await mkdir(repo);
    const db = openDatabase(stateDir);
    try { migrate(db); db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', repo, 'repo', 'now', 'now'); createTask(db, 'r', 'Build thing'); }
    finally { db.close(); }
    const started = performance.now();
    const output = await runSessionStartHook({ budgetMs: 20_000, cwd: repo, stateDir, gitRoot: async () => repo, gitState: async (_root, kind) => kind === 'status' ? { staged: [], unstaged: [], untracked: [], branch: 'main', clean: true } : 'head1', disableDetachedIndex: true });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(output).toContain('weft_* MCP tools');
    expect(estimateTokens(output)).toBeLessThanOrEqual(400);
  });

  it('prints resume hints, verification, and changed file paths', async () => {
    const root = await tempDir(), stateDir = join(root, 'state'), repo = join(root, 'repo');
    await mkdir(repo);
    const db = openDatabase(stateDir);
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', repo, 'repo', 'now', 'now');
      const task = createTask(db, 'r', 'Build thing');
      saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: 'old', objective: 'Resume objective', status: 'active', findings: [], decisions: [JSON.stringify({ changedFiles: ['src/old.ts'] })], verification: [], nextAction: 'Run focused checks', verificationRecords: [{ command: 'npx vitest run', exitCode: 1, durationMs: 10, outputTail: '', ranAt: 'now', changedFiles: [] }] });
    } finally { db.close(); }
    const output = await runSessionStartHook({ budgetMs: 20_000, cwd: repo, stateDir, gitRoot: async () => repo, gitState: async (_root, kind) => kind === 'status' ? { staged: ['src/new.ts'], unstaged: [], untracked: [], branch: 'main', clean: false } : 'head1', disableDetachedIndex: true });
    expect(output).toContain('Resume: Resume objective');
    expect(output).toContain('Next: Run focused checks');
    expect(output).toContain('FAILED (exit 1) npx vitest run');
    expect(output).toContain('src/new.ts');
    expect(output).toContain('src/old.ts');
    expect(estimateTokens(output)).toBeLessThanOrEqual(400);
  });

  it('reads branch and changes from real git with a single status call', async () => {
    const root = await tempDir();
    const stateDir = join(root, 'state');
    const repo = join(root, 'repo');
    await mkdir(repo);
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
    git('init', '-b', 'trunk');
    await writeFile(join(repo, 'a.txt'), 'a');
    git('add', '.');
    git('commit', '-m', 'init');
    await writeFile(join(repo, 'a.txt'), 'changed');
    await writeFile(join(repo, 'b.txt'), 'new');
    const db = openDatabase(stateDir);
    try { migrate(db); db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', repo, 'repo', 'now', 'now'); }
    finally { db.close(); }
    const output = await runSessionStartHook({ budgetMs: 20_000, cwd: join(repo), stateDir, disableDetachedIndex: true });
    expect(output).toContain('Repo repo | trunk | dirty: 2 files');
  });

  it('dry run does not create settings', async () => {
    const project = await tempDir();
    const result = await installClaudeHooks({ projectRoot: project, dryRun: true });
    await expect(readFile(result.path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
