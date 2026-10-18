import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { getUserPaths } from '../config/paths.js';
import { openDatabase } from '../storage/db.js';
import { migrate } from '../storage/migrator.js';
import { resumeTask, saveCheckpoint } from '../memory/taskManager.js';
import { runGit, type WorkingTreeStatus } from '../core/gitstate/gitRunner.js';
import { computeWorkingTreeFingerprint } from '../core/fingerprint/hasher.js';
import { estimateTokens } from '../core/estimate/tokenEstimator.js';
import { redactSafe } from '../core/security/redactor.js';
import { runHookSafely } from '../integrations/claude-code/index.js';
import { indexRepository } from '../indexer/indexer.js';
import type Database from 'better-sqlite3';

const MARKER = 'weft-hook';
const EVENTS = ['SessionStart', 'Stop', 'PreCompact'] as const;
type Event = typeof EVENTS[number];
type GitState = (root: string, kind: 'status' | 'head') => Promise<WorkingTreeStatus | string | null>;
async function hookGitRoot(cwd: string): Promise<string | null> {
  try { const result = await runGit(cwd, ['rev-parse', '--show-toplevel'], { timeoutMs: 140 }); return result.exitCode === 0 ? resolve(result.stdout.trim()) : null; } catch { return null; }
}
const realGitState: GitState = async (root, kind) => {
  try {
    if (kind === 'head') { const result = await runGit(root, ['rev-parse', '--verify', 'HEAD'], { timeoutMs: 140 }); return result.exitCode === 0 ? result.stdout.trim() : null; }
    const [status, branch] = await Promise.all([
      runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { timeoutMs: 140 }),
      runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { timeoutMs: 140 }),
    ]);
    if (status.exitCode !== 0) return null;
    const staged: string[] = [], unstaged: string[] = [], untracked: string[] = [];
    const entries = status.stdout.split('\0');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!; if (!entry) continue;
      const x = entry[0] ?? ' ', y = entry[1] ?? ' ', path = entry.slice(3) || entry.slice(2);
      if (x === '?' && y === '?') untracked.push(path);
      else { if (x !== ' ') staged.push(path); if (y !== ' ') unstaged.push(path); if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i++; }
    }
    return { staged, unstaged, untracked, branch: branch.exitCode === 0 ? branch.stdout.trim() : 'HEAD', clean: !staged.length && !unstaged.length && !untracked.length };
  } catch { return null; }
};
const samePath = (a: string, b: string) => resolve(a).replace(/\\/g, '/').toLowerCase() === resolve(b).replace(/\\/g, '/').toLowerCase();

function dbAt(stateDir: string): Database.Database { const db = openDatabase(stateDir); migrate(db); return db; }
function repoFor(db: Database.Database, cwd: string) {
  return db.prepare('SELECT id, root_path AS rootPath, display_name AS name FROM repositories').all()
    .find((repo) => samePath((repo as { rootPath: string }).rootPath, cwd)) as { id: string; rootPath: string; name: string } | undefined;
}
function latestTask(db: Database.Database, repoId: string) {
  return db.prepare("SELECT id, title FROM tasks WHERE repo_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").get(repoId) as { id: string; title: string } | undefined;
}

export async function runSessionStartHook(options: { cwd?: string; stateDir: string; gitState?: GitState; gitRoot?: (cwd: string) => Promise<string | null>; writeIndexMarker?: boolean } ): Promise<string> {
  const result = await runHookSafely(async () => {
    const cwd = resolve(options.cwd ?? process.cwd());
    const root = await (options.gitRoot ?? hookGitRoot)(cwd);
    if (!root) return '';
    const db = dbAt(options.stateDir);
    try {
      const repo = repoFor(db, root);
      if (!repo) return '';
      const git = options.gitState ?? realGitState;
      const [status, head] = await Promise.all([git(root, 'status'), git(root, 'head')]);
      if (!status || typeof status === 'string') return '';
      const headId = typeof head === 'string' ? head : '';
      const marker = join(options.stateDir, `hook-head-${createHash('sha1').update(repo.id).digest('hex')}`);
      const previousHead = existsSync(marker) ? await readFile(marker, 'utf8').catch(() => '') : '';
      const summary = headId && previousHead !== headId ? await Promise.race([
        indexRepository(db, repo.id, repo.rootPath).then(() => 'indexed'),
        new Promise<'slow'>((resolvePromise) => setTimeout(() => resolvePromise('slow'), 180)),
      ]) : 'skip';
      if (summary !== 'slow' && options.writeIndexMarker !== false && headId) await writeFile(marker, headId, 'utf8').catch(() => undefined);
      const fingerprint = computeWorkingTreeFingerprint(status, headId, status.branch);
      const task = latestTask(db, repo.id);
      let lines = [`Repo ${repo.name} | ${status.branch} | ${status.clean ? 'clean' : `dirty: ${status.staged.length + status.unstaged.length + status.untracked.length} files`}`];
      if (task) {
        const resumed = resumeTask(db, task.id, fingerprint);
        const checkpoint = resumed.checkpoint;
        if (checkpoint) lines.push(`Task resume: ${redactSafe(checkpoint.objective || task.title)}${resumed.isStale ? ' (checkpoint may be stale; Git state changed)' : ''}${checkpoint.nextAction ? ` — ${redactSafe(checkpoint.nextAction)}` : ''}`);
      }
      lines.push('Weft tools: weft_* MCP tools and `ctx context` are available.');
      let output = lines.join('\n');
      while (estimateTokens(output) > 400) { output = lines.slice(0, -1).join('\n') + '\n' + lines.at(-1); if (lines.length <= 1) break; lines.splice(1, 1); }
      return output;
    } finally { db.close(); }
  }, 430).catch(() => undefined);
  return typeof result === 'string' ? result : '';
}

export async function runCheckpointHook(options: { cwd?: string; stateDir: string; gitState?: GitState; gitRoot?: (cwd: string) => Promise<string | null> }): Promise<void> {
  await runHookSafely(async () => {
    try {
      const cwd = resolve(options.cwd ?? process.cwd());
      const root = await (options.gitRoot ?? hookGitRoot)(cwd);
      if (!root) return;
      const db = dbAt(options.stateDir);
      try {
        const repo = repoFor(db, root); if (!repo) return;
        const task = latestTask(db, repo.id); if (!task) return;
        const git = options.gitState ?? realGitState;
        const [status, head] = await Promise.all([git(root, 'status'), git(root, 'head')]);
        if (!status || typeof status === 'string') return;
        const headId = typeof head === 'string' ? head : '';
        const fingerprint = computeWorkingTreeFingerprint(status, headId, status.branch);
        const previous = db.prepare('SELECT working_tree_fingerprint AS fingerprint, revision FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(task.id) as { fingerprint: string; revision: string | null } | undefined;
        if (previous?.fingerprint === fingerprint && previous.revision === headId) return;
        const details = redactSafe(JSON.stringify({ branch: status.branch, changedFiles: [...status.staged, ...status.unstaged, ...status.untracked], lastCommit: headId }));
        saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: fingerprint, revision: headId, objective: '', status: 'active', findings: [], decisions: [details], verification: [], nextAction: '' });
      } finally { db.close(); }
    } catch { /* Hooks must never interrupt the agent. */ }
  }, 430);
}

type Settings = { hooks?: Partial<Record<Event, Array<{ matcher?: string; hooks?: Array<Record<string, unknown>> }>>>; [key: string]: unknown };
function hookEntry(event: Event) { return { matcher: '', hooks: [{ type: 'command', command: `ctx hook ${event === 'SessionStart' ? 'session-start' : event === 'Stop' ? 'stop' : 'pre-compact'} # ${MARKER}` }] }; }
function isWeftHook(hook: Record<string, unknown>) { return typeof hook.command === 'string' && hook.command.includes(`# ${MARKER}`); }
export async function installClaudeHooks(options: { projectRoot?: string; home?: string; global?: boolean; dryRun?: boolean } = {}) {
  const path = options.global ? join(options.home ?? homedir(), '.claude', 'settings.json') : join(options.projectRoot ?? process.cwd(), '.claude', 'settings.json');
  let settings: Settings = {};
  try { settings = JSON.parse(await readFile(path, 'utf8')) as Settings; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const updated: Settings = { ...settings, hooks: { ...settings.hooks } };
  for (const event of EVENTS) {
    const entries = [...(updated.hooks?.[event] ?? [])];
    const cleaned = entries.map((entry) => ({ ...entry, hooks: (entry.hooks ?? []).filter((hook) => !isWeftHook(hook)) })).filter((entry) => (entry.hooks ?? []).length);
    cleaned.push(hookEntry(event));
    updated.hooks![event] = cleaned;
  }
  const content = `${JSON.stringify(updated, null, 2)}\n`;
  const before = await readFile(path, 'utf8').catch(() => '');
  const modified = before !== content;
  if (modified && !options.dryRun) { await mkdir(join(path, '..'), { recursive: true }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, content, 'utf8'); await rename(temp, path); }
  return { path, modified, dryRun: !!options.dryRun };
}

export async function uninstallClaudeHooks(options: { projectRoot?: string; home?: string; global?: boolean } = {}) {
  const path = options.global ? join(options.home ?? homedir(), '.claude', 'settings.json') : join(options.projectRoot ?? process.cwd(), '.claude', 'settings.json');
  const settings = JSON.parse(await readFile(path, 'utf8')) as Settings;
  const hooks = { ...settings.hooks };
  let modified = false;
  for (const event of EVENTS) {
    const entries = hooks[event] ?? [];
    hooks[event] = entries.map((entry) => {
      const kept = (entry.hooks ?? []).filter((hook) => !isWeftHook(hook));
      if (kept.length !== (entry.hooks ?? []).length) modified = true;
      return { ...entry, hooks: kept };
    }).filter((entry) => (entry.hooks ?? []).length);
  }
  if (modified) { const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`, 'utf8'); await rename(temp, path); }
  return { path, modified };
}

export function hookStateDir() { return process.env.WEFT_STATE_DIR ?? getUserPaths().state; }
export function hookSettingsRoot() { return process.cwd(); }
