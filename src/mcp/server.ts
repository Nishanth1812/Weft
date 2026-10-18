import type Database from 'better-sqlite3';
import { createInterface } from 'node:readline';
import { realpath, readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { redactSafe } from '../core/security/redactor.js';
import { isSensitivePath } from '../core/security/paths.js';
import { estimateTokens } from '../core/estimate/tokenEstimator.js';
import { searchChunks } from '../context/search.js';
import { packContext } from '../context/packer.js';
import { rankCandidates } from '../context/ranker.js';
import { formatContext, formatSearch } from '../cli/format.js';
import { createTask, saveCheckpoint, resumeTask, latestVerification } from '../memory/taskManager.js';
import { checkRepoHealth } from '../health/healthChecker.js';
import { getWorkingTreeStatus } from '../core/gitstate/gitRunner.js';
import { getHeadCommit } from '../core/gitstate/gitRunner.js';
import { computeWorkingTreeFingerprint } from '../core/fingerprint/hasher.js';
import { indexRepository } from '../indexer/indexer.js';
import { recordToolCall, baselineTokensForChunks } from '../telemetry/toolCalls.js';

export const MCP_TOOLS = [
  { name: 'weft_search', description: 'Find indexed code locations.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
  { name: 'weft_context', description: 'Pack relevant code within a token budget.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, budget: { type: 'number' } }, required: ['query'] } },
  { name: 'weft_read', description: 'Read a safe file range from disk.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } }, required: ['path', 'startLine', 'endLine'] } },
  { name: 'weft_checkpoint', description: 'Save task continuity state.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, objective: { type: 'string' }, findings: { type: 'array', items: { type: 'string' } }, decisions: { type: 'array', items: { type: 'string' } }, nextAction: { type: 'string' } } } },
  { name: 'weft_resume', description: 'Resume a task checkpoint.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } } } },
  { name: 'weft_health', description: 'Check repository health.', inputSchema: { type: 'object', properties: {} } },
];

type Args = Record<string, unknown>;
export function findMcpRepo(db: Database.Database, gitRoot: string) {
  const key = (path: string) => resolve(path).replace(/\\/g, '/').toLowerCase();
  return (db.prepare('SELECT id, root_path AS rootPath FROM repositories').all() as Array<{ id: string; rootPath: string }>).find((repo) => key(repo.rootPath) === key(gitRoot));
}
function requiredString(args: Args, name: string): string { const value = args[name]; if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`); return value; }
const filesFor = (db: Database.Database, repoId: string, paths: string[]) => paths.length ? db.prepare(`SELECT id AS file_id FROM files WHERE repo_id = ? AND path IN (${paths.map(() => '?').join(',')})`).all(repoId, ...paths) as Array<{ file_id: number }> : [];

export function createMcpHandler(db: Database.Database, repo: { id: string; rootPath: string } | null, options: { index?: typeof indexRepository } = {}) {
  let lastFingerprint: string | undefined, indexing: Promise<unknown> | undefined, refreshing: Promise<boolean> | undefined, refreshPending = false;
  const index = options.index ?? indexRepository;
  const refresh = (): Promise<boolean> => {
    if (!repo) return Promise.resolve(false);
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const [git, head] = await Promise.all([getWorkingTreeStatus(repo.rootPath), getHeadCommit(repo.rootPath)]);
      const changedFiles = [...git.staged, ...git.unstaged, ...git.untracked].sort();
      const changes = await Promise.all(changedFiles.map(async path => {
        try { const file = await stat(resolve(repo.rootPath, path)); return `${path}:${file.size}:${file.mtimeMs}`; }
        catch { return `${path}:deleted`; }
      }));
      const fingerprint = `${computeWorkingTreeFingerprint(git, head ?? '', git.branch)}:${changes.join('|')}`;
      if (fingerprint === lastFingerprint) return Boolean(indexing);
      if (indexing) { refreshPending = true; return true; }
      lastFingerprint = fingerprint;
      const started = Date.now();
      indexing = index(db, repo.id, repo.rootPath).catch(error => { lastFingerprint = undefined; throw error; }).finally(() => {
        indexing = undefined;
        if (refreshPending) { refreshPending = false; lastFingerprint = undefined; void refresh(); }
      });
      const outcome = await Promise.race([indexing.then(() => 'done'), new Promise<'slow'>(resolve => setTimeout(() => resolve('slow'), 1500))]);
      return outcome === 'slow' || Date.now() - started > 1500;
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  };
  return async (method: string, params: Args = {}): Promise<unknown> => {
    if (method === 'initialize') return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'weft', version: '0.1.0' } };
    if (method === 'tools/list') return { tools: MCP_TOOLS };
    if (method !== 'tools/call') throw new Error(`Method not found: ${method}`);
    const name = requiredString(params, 'name'); const args = (params.arguments ?? {}) as Args;
    if (!repo) return { content: [{ type: 'text', text: 'Weft MCP tools need a Git repository. Start the harness from inside a Git workspace.' }], isError: false };
    const started = Date.now(); let text = ''; let baseline: number | null = null; let note = '';
    try {
      if (['weft_search', 'weft_context'].includes(name)) note = await refresh() ? '\nindex refreshing' : '';
      let value: unknown;
      if (name === 'weft_search') {
        const query = requiredString(args, 'query'); const limit = Number(args.limit ?? 10);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be 1–100');
        const rows = searchChunks(db, repo.id, query, limit); baseline = baselineTokensForChunks(db, repo.id, filesFor(db, repo.id, rows.map(row => row.path)));
        value = formatSearch(rows);
      } else if (name === 'weft_context') {
        const query = requiredString(args, 'query'); const budget = Number(args.budget ?? 1500);
        if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100_000) throw new Error('budget must be 1–100000');
        const items = packContext(rankCandidates(searchChunks(db, repo.id, query, 100), query), budget, query).items;
        baseline = baselineTokensForChunks(db, repo.id, filesFor(db, repo.id, items.map(row => row.path)));
        value = formatContext(items);
      } else if (name === 'weft_read') {
        const path = requiredString(args, 'path'); const start = Number(args.startLine); const end = Number(args.endLine);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start > 1000) throw new Error('Invalid line range');
        const root = await realpath(repo.rootPath), target = resolve(root, path), rel = relative(root, target);
        if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error('Path must be inside the repository');
        if (isSensitivePath(rel.replace(/\\/g, '/'))) throw new Error('Sensitive paths cannot be read');
        const canonicalTarget = await realpath(target), canonicalRel = relative(root, canonicalTarget);
        if (!canonicalRel || canonicalRel === '..' || canonicalRel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(canonicalRel)) throw new Error('Path must be inside the repository');
        if (isSensitivePath(canonicalRel.replace(/\\/g, '/'))) throw new Error('Sensitive paths cannot be read');
        const content = await readFile(canonicalTarget, 'utf8'); const lines = content.split(/\r?\n/).slice(start - 1, end);
        text = lines.map((line, i) => `${start + i}: ${line}`).join('\n');
        baseline = estimateTokens(content);
      } else if (name === 'weft_checkpoint' || name === 'weft_resume') {
        const git = await getWorkingTreeStatus(repo.rootPath), head = await getHeadCommit(repo.rootPath) ?? '';
        const fingerprint = computeWorkingTreeFingerprint(git, head, git.branch);
        let taskId = typeof args.taskId === 'string' && args.taskId ? args.taskId : undefined;
        if (!taskId) {
          const task = db.prepare("SELECT id FROM tasks WHERE repo_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").get(repo.id) as { id: string } | undefined;
          taskId = task?.id ?? createTask(db, repo.id, 'MCP session').id;
        }
        const task = db.prepare('SELECT id, repo_id FROM tasks WHERE id = ?').get(taskId) as { id: string; repo_id: string } | undefined;
        if (!task || task.repo_id !== repo.id) throw new Error(`Task not found: ${taskId}`);
        const changedFiles = [...git.staged, ...git.unstaged, ...git.untracked];
        if (name === 'weft_resume') {
          const resumed = resumeTask(db, taskId, fingerprint);
          value = [JSON.stringify(resumed), resumed.verificationText].filter(Boolean).join('\n');
        } else {
          const findings = Array.isArray(args.findings) ? args.findings.filter((v): v is string => typeof v === 'string').map(text => ({ text, evidence: [] })) : [];
          const decisions = Array.isArray(args.decisions) ? args.decisions.filter((v): v is string => typeof v === 'string') : [];
          decisions.push(redactSafe(JSON.stringify({ changedFiles })));
          const verification = latestVerification(db, taskId);
          value = saveCheckpoint(db, { taskId, workingTreeFingerprint: fingerprint, revision: head, objective: typeof args.objective === 'string' ? args.objective : '', status: 'active', findings, decisions, verification: [], verificationRecords: verification ? [verification] : [], nextAction: typeof args.nextAction === 'string' ? args.nextAction : '' });
        }
      } else if (name === 'weft_health') value = await checkRepoHealth(repo.rootPath);
      else throw new Error(`Unknown tool: ${name}`);
      if (!text) text = typeof value === 'string' ? value : JSON.stringify(value);
      text = redactSafe(text + note);
      try { recordToolCall(db, { repoId: repo.id, tool: name, returnedTokens: estimateTokens(text), baselineTokens: baseline, ms: Date.now() - started }); } catch { /* Telemetry must not interrupt tools. */ }
      return { content: [{ type: 'text', text }], isError: false };
    } catch (error) {
      try { recordToolCall(db, { repoId: repo.id, tool: name, returnedTokens: 0, baselineTokens: baseline, ms: Date.now() - started }); } catch { /* Telemetry must not interrupt tools. */ }
      throw error;
    }
  };
}

export function serveMcp(db: Database.Database, repo: { id: string; rootPath: string } | null, streams = { input: process.stdin, output: process.stdout }): void {
  const handle = createMcpHandler(db, repo); const lines = createInterface({ input: streams.input });
  let closed = false;
  const autoCheckpoint = async () => {
    if (closed || !repo) return; closed = true;
    const task = db.prepare("SELECT id FROM tasks WHERE repo_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").get(repo.id) as { id: string } | undefined;
    if (!task) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([getWorkingTreeStatus(repo.rootPath).then(async git => {
        const head = await getHeadCommit(repo.rootPath) ?? '', fingerprint = computeWorkingTreeFingerprint(git, head, git.branch);
        const prev = db.prepare('SELECT working_tree_fingerprint AS fingerprint FROM checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1').get(task.id) as { fingerprint: string } | undefined;
        if (prev?.fingerprint === fingerprint) return;
        saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: fingerprint, revision: head, objective: '', status: 'active', findings: [], decisions: [JSON.stringify({ changedFiles: [...git.staged, ...git.unstaged, ...git.untracked] })], verification: [], nextAction: '' });
      }), new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); })]);
    } catch { /* Process shutdown must not wait for checkpointing. */ }
    finally { if (timer) clearTimeout(timer); }
  };
  lines.once('close', autoCheckpoint);
  process.once('SIGINT', () => { void autoCheckpoint().finally(() => process.kill(process.pid, 'SIGINT')); });
  process.once('SIGTERM', () => { void autoCheckpoint().finally(() => process.kill(process.pid, 'SIGTERM')); });
  lines.on('line', async (line) => {
    let message: { id?: unknown; method?: string; params?: Args };
    try { message = JSON.parse(line) as typeof message; } catch { return; }
    if (!message.method || message.id === undefined) return;
    try { streams.output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: await handle(message.method, message.params) })}\n`); }
    catch (error) { streams.output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: redactSafe(error instanceof Error ? error.message : String(error)) } })}\n`); }
  });
}
