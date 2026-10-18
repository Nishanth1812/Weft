import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, delimiter, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getUserPaths } from '../../config/paths.js';
import { loadConfig, saveConfig } from '../../config/manager.js';
import { createTask, resumeTask, saveCheckpoint } from '../../memory/taskManager.js';
import { checkRepoHealth, type HealthReport } from '../../health/healthChecker.js';
import { generatePortfolioSummary } from '../../health/portfolio.js';
import { indexRepository } from '../../indexer/indexer.js';
import { packContext } from '../../context/packer.js';
import { searchChunks } from '../../context/search.js';
import { rankCandidates } from '../../context/ranker.js';
import { parseIntent, generateDefaultIntent } from '../../core/intents/intentParser.js';
import { getGitRoot, getHeadCommit, getWorkingTreeStatus } from '../../core/gitstate/gitRunner.js';
import { computeWorkingTreeFingerprint } from '../../core/fingerprint/hasher.js';
import { normalizeCanonicalPath } from '../../config/paths.js';
import { fuzzyFindRepo } from '../../core/registry/repoRegistry.js';
import { syncClaudeInstructions, CLAUDE_CODE_GUIDELINES, hookStateDir, installClaudeHooks, runCheckpointHook, runSessionStartHook, uninstallClaudeHooks } from '../../integrations/claude-code/index.js';
import { syncCodexInstructions, CODEX_GUIDELINES } from '../../integrations/codex/index.js';
import { checkInstructions } from '../../integrations/instructions.js';
import { getCacheDiagnostics, getCostSummary, listSessions } from '../../telemetry/analytics.js';
import { migrateDevPulse } from '../../migration/devpulse/migrator.js';
import { openDatabase } from '../../storage/db.js';
import { migrate } from '../../storage/migrator.js';
import type Database from 'better-sqlite3';
import { installMcpConfig, type Harness } from '../../integrations/mcpConfig.js';
import { serveMcp } from '../../mcp/server.js';
import { runRetrievalBenchmark } from '../../bench/retrieval.js';
import { loadSuite, runLiveSuite } from '../../bench/live.js';

type Result = { code: number; data?: unknown; warnings?: string[]; errors?: string[]; status?: string };
class CommandError extends Error { constructor(message: string, readonly exitCode: number) { super(message); } }
function fail(message: string, code: number): never { throw new CommandError(message, code); }
const paths = getUserPaths();
const dbFile = join(paths.state, 'weft.db');

function database(required = true): Database.Database {
  if (required && !existsSync(dbFile)) fail('Weft is not initialized. Run `ctx init` first.', 3);
  const db = openDatabase(paths.state);
  try { migrate(db); } catch (error) { db.close(); throw error; }
  return db;
}

function option(args: string[], name: string, fallback?: string): string | undefined {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  const value = args[at + 1];
  if (!value || value.startsWith('--')) fail(`${name} requires a value`, 2);
  return value;
}
function positional(args: string[]): string[] {
  const values: string[] = [];
  const valued = new Set(['--name', '--limit', '--budget', '--scope', '--since', '--source']);
  for (let i = 0; i < args.length; i++) {
    if (valued.has(args[i]!)) { i++; continue; }
    if (!args[i]!.startsWith('--')) values.push(args[i]!);
  }
  return values;
}
function requireCount(value: string | undefined, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail(`${label} must be a positive integer`, 2);
  return number;
}
function repoRow(db: Database.Database, query?: string): { id: string; root_path: string; display_name: string } {
  const root = process.cwd();
  const rows = db.prepare('SELECT id, root_path, display_name FROM repositories ORDER BY display_name').all() as Array<{ id: string; root_path: string; display_name: string }>;
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
  const same = (a: string, b: string) => norm(a) === norm(b);
  const match = query ? rows.find((row) => row.id === query || row.display_name.toLowerCase() === query.toLowerCase() || same(row.root_path, resolve(query)))
    : rows.find((row) => same(row.root_path, root));
  if (match) return match;
  if (!query && !rows.length) fail('No repositories are registered. Run `ctx repos register` first.', 3);
  if (!query) fail(`Current directory is not registered: ${root}`, 3);
  fail(`Repository not found: ${query}`, 3);
}
function allRepos(db: Database.Database) {
  return db.prepare('SELECT id, root_path AS rootPath, display_name AS name, created_at AS registeredAt FROM repositories ORDER BY display_name').all() as Array<{ id: string; rootPath: string; name: string; registeredAt: string }>;
}
function duration(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d+)([smhdw])$/i.exec(value);
  if (!match) fail('--since must be a duration such as 7d or 2h', 2);
  const factors: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return new Date(Date.now() - Number(match[1]) * factors[match[2]!.toLowerCase()]!).toISOString();
}
function isHarness(value: string | undefined): value is Harness { return ['claude-code', 'codex', 'opencode', 't3'].includes(value ?? ''); }
function commandOnPath(name: string): boolean {
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  return (process.env.PATH ?? '').split(delimiter).some((dir) => extensions.some((extension) => existsSync(join(dir, `${name}${extension}`))));
}

export async function runCommand(args: string[], compactOutput = false): Promise<Result> {
  const [group, sub, ...rest] = args;
  validateFlags(args);
  if (group === 'init') {
    await mkdir(paths.config, { recursive: true }); await mkdir(paths.instructions, { recursive: true }); await mkdir(paths.state, { recursive: true }); await mkdir(paths.cache, { recursive: true });
    const config = await loadConfig(); await saveConfig(config);
    const db = database(false); db.close();
    const intentPath = join(paths.instructions, 'intent.md');
    if (!existsSync(intentPath)) await writeFile(intentPath, generateDefaultIntent(), 'utf8');
    return { code: 0, data: { initialized: true, paths } };
  }
  if (group === 'doctor') {
    if (!existsSync(dbFile) && !args.includes('--repair')) fail('Weft is not initialized. Run `ctx init` first.', 3);
    const db = database(false);
    try {
      const integrity = db.prepare('PRAGMA integrity_check').pluck().get() as string;
      const warnings = integrity === 'ok' ? [] : [`SQLite integrity check: ${integrity}`];
      const data = { node: process.version, database: integrity, repositories: allRepos(db).length, ctxOnPath: commandOnPath('ctx') };
      return { code: warnings.length ? 6 : 0, data, warnings };
    } finally { db.close(); }
  }
  if (group === 'mcp' && sub === 'serve') {
    const db = database(); const repo = repoRow(db);
    serveMcp(db, { id: repo.id, rootPath: repo.root_path });
    return await new Promise<Result>(() => {});
  }
  if (group === 'mcp' && sub === 'install') {
    const harness = option(rest, '--harness');
    if (!isHarness(harness)) fail('--harness must be claude-code, codex, opencode, or t3', 2);
    const result = await installMcpConfig(harness, { home: process.env.HOME ?? process.env.USERPROFILE ?? process.cwd(), project: process.cwd(), dryRun: args.includes('--dry-run') });
    return { code: 0, data: result };
  }
  if (group === 'hook') {
    if (sub === 'session-start') { const data = await runSessionStartHook({ stateDir: hookStateDir() }); return { code: 0, data: data || undefined }; }
    if (sub === 'stop' || sub === 'pre-compact') { await runCheckpointHook({ stateDir: hookStateDir() }); return { code: 0, data: '' }; }
    fail('Use `ctx hook session-start|stop|pre-compact`.', 2);
  }
  if (group === 'hooks') {
    const options = { projectRoot: process.cwd(), home: process.env.HOME ?? process.env.USERPROFILE, global: args.includes('--global'), dryRun: args.includes('--dry-run') };
    // Calling node on the real CLI path skips the npm shim (~270ms per hook on Windows); --portable keeps plain `ctx`.
    if (sub === 'install') return { code: 0, data: await installClaudeHooks({ ...options, bin: args.includes('--portable') || !process.argv[1] ? 'ctx' : `node "${realpathSync(resolve(process.argv[1])).replace(/\\/g, '/')}"` }) };
    if (sub === 'uninstall') return { code: 0, data: await uninstallClaudeHooks(options) };
    fail('Use `ctx hooks install|uninstall [--global] [--dry-run]`.', 2);
  }
  if (group === 'onboard') {
    const target = positional(args.slice(1))[0] ?? process.cwd();
    const harnesses = (option(args, '--harness', 'claude-code') ?? 'claude-code').split(',');
    if (harnesses.some((value) => !isHarness(value))) fail('--harness must be claude-code, codex, opencode, or t3 (comma-separated)', 2);
    const registered = await runCommand(['repos', 'register', target]);
    const repo = registered.data as { id: string };
    const indexed = await runCommand(['index', repo.id]);
    const root = await getGitRoot(target); if (!root) fail(`Not a Git repository: ${target}`, 3);
    const instructions = await Promise.all([
      syncClaudeInstructions(root, CLAUDE_CODE_GUIDELINES), syncCodexInstructions(root, CODEX_GUIDELINES),
    ]);
    const installed = await Promise.all(harnesses.map((value) => installMcpConfig(value as Harness, { home: process.env.HOME ?? process.env.USERPROFILE ?? process.cwd(), project: root })));
    return { code: 0, data: { registered: registered.data, indexed: indexed.data, instructions, installed } };
  }
  if (group === 'instructions') {
    const action = sub;
    if (action !== 'sync' && action !== 'check') fail('Use `ctx instructions sync` or `check`.', 2);
    const root = await getGitRoot(process.cwd()); if (!root) fail('Current directory is not a Git repository.', 3);
    const dry = args.includes('--dry-run') || action === 'check';
    const checks = await Promise.all([
      action === 'check' ? checkInstructions(join(root, 'CLAUDE.md'), CLAUDE_CODE_GUIDELINES) : syncClaudeInstructions(root, CLAUDE_CODE_GUIDELINES, dry),
      action === 'check' ? checkInstructions(join(root, 'AGENTS.md'), CODEX_GUIDELINES) : syncCodexInstructions(root, CODEX_GUIDELINES, dry),
    ]);
    const drift = action === 'check' ? checks.filter((item) => 'matches' in item && !item.matches).length : checks.filter((item) => 'modified' in item && item.modified).length;
    return { code: drift ? 4 : 0, data: checks, warnings: drift ? [`${drift} instruction file(s) ${action === 'check' ? 'need synchronization' : 'would change'}.`] : [] };
  }
  if (group === 'repos') {
    if (sub === 'list') { const db = database(); try { return { code: 0, data: allRepos(db) }; } finally { db.close(); } }
    if (sub === 'register') {
      const db = database(false);
      try {
        const target = positional(rest)[0] ?? process.cwd(); const gitRoot = await getGitRoot(target); if (!gitRoot) fail(`Not a Git repository: ${target}`, 3);
        const rootPath = await normalizeCanonicalPath(gitRoot); const name = option(rest, '--name', basename(rootPath))!;
        const existing = db.prepare('SELECT id, root_path, display_name FROM repositories WHERE root_path = ?').get(rootPath) as { id: string; root_path: string; display_name: string } | undefined;
        if (existing) return { code: 0, data: existing };
        const conflict = db.prepare('SELECT 1 FROM repositories WHERE display_name = ?').get(name);
        if (conflict) fail(`Repository name already registered: ${name}`, 2);
        const id = randomUUID(); const now = new Date().toISOString();
        db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(id, rootPath, name, now, now);
        return { code: 0, data: { id, rootPath, name } };
      } finally { db.close(); }
    }
    if (sub === 'unregister') {
      const name = positional(rest)[0]; if (!name) fail('Usage: ctx repos unregister <repo>', 2);
      const db = database(); try { const repo = repoRow(db, name); db.prepare('DELETE FROM repositories WHERE id = ?').run(repo.id); return { code: 0, data: { unregistered: repo.display_name } }; } finally { db.close(); }
    }
    if (sub === 'fuzzy') {
      const query = positional(rest).join(' '); if (!query) fail('Usage: ctx repos fuzzy <query>', 2);
      const db = database(); try { const rows = allRepos(db); const result = fuzzyFindRepo(query, rows.map(({ name, rootPath, registeredAt }) => ({ name, rootPath, registeredAt }))); return { code: result.match ? 0 : 4, data: result, warnings: result.match ? [] : ['No unique repository match.'] }; } finally { db.close(); }
    }
    if (sub === 'status') {
      const db = database(); try { const repo = repoRow(db, positional(rest)[0]); const git = await getWorkingTreeStatus(repo.root_path); const index = db.prepare('SELECT active_generation FROM repo_index_state WHERE repo_id = ?').get(repo.id); return { code: 0, data: { repo, git, index } }; } finally { db.close(); }
    }
    fail('Use `ctx repos register|unregister|list|fuzzy|status`.', 2);
  }
  if (group === 'index') {
    const db = database(); try { const repo = repoRow(db, positional(args.slice(1))[0]); return { code: 0, data: await indexRepository(db, repo.id, repo.root_path, { force: args.includes('--force') }) }; } finally { db.close(); }
  }
  if (group === 'search' || group === 'context') {
    const values = positional(args.slice(1));
    if (!values.length) fail(`Usage: ctx ${group} <query> [repo]`, 2);
    const db = database(); try {
      let repoIndex = -1;
      for (let i = values.length - 1; i >= 0; i--) {
        if (db.prepare('SELECT 1 FROM repositories WHERE display_name = ? OR id = ?').get(values[i], values[i])) { repoIndex = i; break; }
      }
      const repoArg = repoIndex < 0 ? undefined : values[repoIndex];
      const query = values.filter((_value, index) => index !== repoIndex).join(' ');
      if (!query) fail(`Usage: ctx ${group} <query> [repo]`, 2);
      const repo = repoRow(db, repoArg);
      if (group === 'search') {
        const hits = searchChunks(db, repo.id, query, requireCount(option(args, '--limit'), '--limit', 20));
        return { code: 0, data: compactOutput ? rankCandidates(hits, query) : hits };
      }
      const results = rankCandidates(searchChunks(db, repo.id, query, 100), query);
      const contextHits = compactOutput ? results.filter((hit, index) => results.findIndex(other => other.path === hit.path) === index).slice(0, 2) : results;
      return { code: 0, data: packContext(contextHits, requireCount(option(args, '--budget'), '--budget', 1500), query) };
    } finally { db.close(); }
  }
  if (group === 'task') {
    const db = database(); try {
      if (sub === 'start') {
        const parts = positional(rest); const repos = allRepos(db); const last = parts.at(-1);
        const target = last ? repos.find((repo) => repo.name.toLowerCase() === last.toLowerCase() || repo.id === last || repo.rootPath.toLowerCase() === resolve(last).toLowerCase()) : undefined;
        const title = (target ? parts.slice(0, -1) : parts).join(' ');
        if (!title) fail('Usage: ctx task start <title> [repo]', 2);
        return { code: 0, data: createTask(db, repoRow(db, target?.id).id, title) };
      }
      if (sub === 'resume') { const id = positional(rest)[0]; if (!id) fail('Usage: ctx task resume <id>', 2); const task = db.prepare('SELECT repo_id FROM tasks WHERE id = ?').get(id) as { repo_id: string } | undefined; if (!task) fail(`Task not found: ${id}`, 3); const repo = repoRow(db, task.repo_id); const git = await getWorkingTreeStatus(repo.root_path); const fingerprint = computeWorkingTreeFingerprint(git, await getHeadCommit(repo.root_path) ?? '', git.branch); return { code: 0, data: resumeTask(db, id, fingerprint) }; }
      if (sub === 'checkpoint') { const id = positional(rest)[0]; if (!id) fail('Usage: ctx task checkpoint <id>', 2); const task = db.prepare('SELECT repo_id FROM tasks WHERE id = ?').get(id) as { repo_id: string } | undefined; if (!task) fail(`Task not found: ${id}`, 3); const repo = repoRow(db, task.repo_id); const git = await getWorkingTreeStatus(repo.root_path); const fingerprint = computeWorkingTreeFingerprint(git, await getHeadCommit(repo.root_path) ?? '', git.branch); return { code: 0, data: saveCheckpoint(db, { taskId: id, workingTreeFingerprint: fingerprint, objective: '', status: 'active', findings: [], decisions: [], verification: [], nextAction: '' }) }; }
      fail('Use `ctx task start|resume|checkpoint`.', 2);
    } finally { db.close(); }
  }
  if (group === 'checkpoint') {
    const id = sub; if (!id) fail('Usage: ctx checkpoint <id>', 2);
    const db = database(); try {
      const task = db.prepare('SELECT repo_id FROM tasks WHERE id = ?').get(id) as { repo_id: string } | undefined;
      if (!task) fail(`Task not found: ${id}`, 3);
      const repo = repoRow(db, task.repo_id); const git = await getWorkingTreeStatus(repo.root_path);
      const fingerprint = computeWorkingTreeFingerprint(git, await getHeadCommit(repo.root_path) ?? '', git.branch);
      return { code: 0, data: saveCheckpoint(db, { taskId: id, workingTreeFingerprint: fingerprint, objective: '', status: 'active', findings: [], decisions: [], verification: [], nextAction: '' }) };
    } finally { db.close(); }
  }
  if (group === 'intent') {
    const path = join(paths.instructions, 'intent.md');
    if (sub === 'show') { if (!existsSync(path)) fail('intent.md is missing. Run `ctx init` first.', 3); return { code: 0, data: parseIntent(await readFile(path, 'utf8')) }; }
    if (sub === 'edit') { await mkdir(paths.instructions, { recursive: true }); if (!existsSync(path)) await writeFile(path, generateDefaultIntent(), 'utf8'); const editor = process.env.EDITOR ?? process.env.VISUAL; if (!editor) fail('$EDITOR is not set.', 3); await new Promise<void>((resolvePromise, reject) => { const child = spawn(editor, [path], { stdio: 'inherit' }); child.once('error', reject); child.once('exit', (code: number | null) => code === 0 ? resolvePromise() : reject(new Error(`Editor exited with code ${code}`))); }); return { code: 0, data: { path } }; }
    fail('Use `ctx intent show|edit`.', 2);
  }
  if (group === 'health') { const db = database(); try { const repo = repoRow(db, positional(args.slice(1))[0]); const data = await checkRepoHealth(repo.root_path); return { code: findings(data) ? 4 : 0, data, warnings: findings(data) ? ['Health findings were reported.'] : [] }; } finally { db.close(); } }
  if (group === 'portfolio') { const db = database(); try { const repos = allRepos(db).map((repo) => ({ name: repo.name, rootPath: repo.rootPath, registeredAt: repo.registeredAt })); const data = await generatePortfolioSummary(repos); return { code: findings(data.totals) ? 4 : 0, data }; } finally { db.close(); } }
  if (group === 'costs' || group === 'stats' || group === 'cache' || group === 'sessions') {
    const db = database(); try {
      if (group === 'sessions') return { code: 0, data: listSessions(db, requireCount(option(args, '--limit'), '--limit', 50)) };
      const since = duration(option(args, '--since'));
      const by = option(args, '--by') as 'harness' | 'model' | 'repo' | undefined;
      if (by && !['harness', 'model', 'repo'].includes(by)) fail('--by must be harness, model, or repo', 2);
      return { code: 0, data: group === 'cache' ? getCacheDiagnostics(db, { since }) : getCostSummary(db, { since, by }) };
    } finally { db.close(); }
  }
  if (group === 'bench' && sub === 'retrieval') {
    const db = database();
    try {
      const repo = repoRow(db, option(rest, '--repo'));
      await indexRepository(db, repo.id, repo.root_path);
      const queryFile = join(process.cwd(), 'tests', 'golden', 'queries.json');
      if (!existsSync(queryFile)) fail(`Golden query file not found: ${queryFile}`, 3);
      const queries = JSON.parse(await readFile(queryFile, 'utf8')) as Array<{ query: string; expectedTop3: string[] }>;
      const report = await runRetrievalBenchmark(db, repo.id, repo.root_path, queries, join(paths.state, 'benchmarks'));
      return { code: 0, data: report };
    } finally { db.close(); }
  }
  if (group === 'bench' && sub === 'run') {
    const suitePath = resolve(option(rest, '--suite') ?? 'tests/benchmarks/suites/example.json');
    const harness = option(rest, '--harness') ?? process.env.WEFT_BENCH_HARNESS;
    if (!harness) fail('Set --harness "command template containing {prompt}" or WEFT_BENCH_HARNESS.', 2);
    const report = await runLiveSuite(await loadSuite(suitePath), harness);
    return { code: 0, data: { ...report, usageProvenance: 'Each trial labels provider_reported or estimated usage.', costPerSuccessfulTaskVariance: 'Population variance in costMicros squared.' } };
  }
  if (group === 'bench') fail('Use `ctx bench retrieval [--repo <name>] [--json]` or `ctx bench run --suite <file> --harness <template>`.', 2);
  if (group === 'clean') {
    const db = database(); try {
      const scope = option(args, '--scope', 'indexes'); if (!['indexes', 'all'].includes(scope!)) fail('--scope must be indexes or all', 2);
      const rows = db.prepare("SELECT id FROM index_generations WHERE status != 'ready' OR completed_at < datetime('now', '-7 days')").all() as Array<{ id: number }>;
      const dryRun = args.includes('--dry-run');
      if (!dryRun && !args.includes('--yes')) fail('Confirmation required; rerun with --yes.', 5);
      if (!dryRun) { const del = db.prepare('DELETE FROM index_generations WHERE id = ?'); db.transaction(() => { for (const row of rows) del.run(row.id); })(); db.exec('VACUUM'); }
      return { code: 0, data: { removed: dryRun ? 0 : rows.length, planned: rows.length, dryRun } };
    } finally { db.close(); }
  }
  if (group === 'migrate' && sub === 'devpulse') {
    const source = option(args, '--source') ?? process.env.DEVPULSE_CONFIG ?? join(process.env.HOME ?? process.env.USERPROFILE ?? process.cwd(), '.devpulse');
    const sourceDir = basename(source).toLowerCase() === 'config.toml' ? resolve(source, '..') : source;
    if (!existsSync(sourceDir)) fail(`DevPulse source not found: ${sourceDir}`, 3);
    const data = await migrateDevPulse({ sourcePath: source, dryRun: args.includes('--dry-run') });
    return { code: data.warnings.length ? 4 : 0, data, warnings: data.warnings };
  }
  fail(`Unknown command: ${group ?? ''}`, 2);
}

function validateFlags(args: string[]): void {
  const valueFlags = new Set(['--name', '--limit', '--budget', '--scope', '--since', '--source', '--by', '--suite', '--harness', '--repo']);
  const known = new Set([...valueFlags, '--force', '--repair', '--dry-run', '--keep-data', '--interactive', '--yes', '--global']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) continue;
    if (!known.has(arg)) fail(`Unknown option: ${arg}`, 2);
    if (valueFlags.has(arg) && (!args[i + 1] || args[i + 1]!.startsWith('--'))) fail(`${arg} requires a value`, 2);
  }
}

function findings(value: HealthReport | { unmergedBranches: number; staleBranches: number; todoCount: number; dirtyFilesCount: number }): number {
  const report = value as HealthReport;
  if (Array.isArray(report.unmergedBranches)) return Number(report.unmergedBranches.length + report.staleBranches.length + report.todoCount + report.dirtyFilesCount > 0);
  const totals = value as { unmergedBranches: number; staleBranches: number; todoCount: number; dirtyFilesCount: number };
  return Number(totals.unmergedBranches + totals.staleBranches + totals.todoCount + totals.dirtyFilesCount > 0);
}
