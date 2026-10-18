import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { createTask } from '../../../src/memory/taskManager.js';
import { installClaudeHooks, uninstallClaudeHooks, runSessionStartHook, runCheckpointHook } from '../../../src/hooks/claude.js';
import { runHookSafely } from '../../../src/integrations/claude-code/index.js';
import { estimateTokens } from '../../../src/core/estimate/tokenEstimator.js';

const dirs: string[] = [];
async function tempDir() { const dir = await mkdtemp(join(tmpdir(), 'weft-hooks-')); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

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
    await runCheckpointHook({ cwd: repo, stateDir, gitState: git, gitRoot: async () => repo });
    await runCheckpointHook({ cwd: repo, stateDir, gitState: git, gitRoot: async () => repo });
    const check = openDatabase(stateDir);
    try {
      const rows = check.prepare('SELECT payload_json FROM checkpoints').all() as Array<{ payload_json: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload_json).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
      expect(rows[0]!.payload_json).toContain('[REDACTED_SECRET:');
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
    const output = await runSessionStartHook({ cwd: repo, stateDir, gitRoot: async () => repo, gitState: async (_root, kind) => kind === 'status' ? { staged: [], unstaged: [], untracked: [], branch: 'main', clean: true } : 'head1', writeIndexMarker: false });
    expect(performance.now() - started).toBeLessThan(500);
    expect(output).toContain('weft_* MCP tools');
    expect(estimateTokens(output)).toBeLessThanOrEqual(400);
  });

  it('dry run does not create settings', async () => {
    const project = await tempDir();
    const result = await installClaudeHooks({ projectRoot: project, dryRun: true });
    await expect(readFile(result.path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
