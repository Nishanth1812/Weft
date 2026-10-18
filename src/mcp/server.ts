import type Database from 'better-sqlite3';
import { createInterface } from 'node:readline';
import { redactSafe } from '../core/security/redactor.js';
import { searchChunks } from '../context/search.js';
import { packContext } from '../context/packer.js';
import { rankCandidates } from '../context/ranker.js';
import { saveCheckpoint, resumeTask } from '../memory/taskManager.js';
import { checkRepoHealth } from '../health/healthChecker.js';
import { getWorkingTreeStatus } from '../core/gitstate/gitRunner.js';
import { getHeadCommit } from '../core/gitstate/gitRunner.js';
import { computeWorkingTreeFingerprint } from '../core/fingerprint/hasher.js';

export const MCP_TOOLS = [
  { name: 'weft_search', description: 'Find indexed code locations.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
  { name: 'weft_context', description: 'Pack relevant code within a token budget.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, budget: { type: 'number' } }, required: ['query'] } },
  { name: 'weft_read', description: 'Read indexed lines from a path.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } }, required: ['path', 'startLine', 'endLine'] } },
  { name: 'weft_checkpoint', description: 'Save task continuity state.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } },
  { name: 'weft_resume', description: 'Resume a task checkpoint.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } },
  { name: 'weft_health', description: 'Check repository health.', inputSchema: { type: 'object', properties: {} } },
];

type Args = Record<string, unknown>;
function requiredString(args: Args, name: string): string { const value = args[name]; if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`); return value; }

export function createMcpHandler(db: Database.Database, repo: { id: string; rootPath: string }) {
  return async (method: string, params: Args = {}): Promise<unknown> => {
    if (method === 'initialize') return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'weft', version: '0.1.0' } };
    if (method === 'tools/list') return { tools: MCP_TOOLS };
    if (method !== 'tools/call') throw new Error(`Method not found: ${method}`);
    const name = requiredString(params, 'name'); const args = (params.arguments ?? {}) as Args;
    let value: unknown;
    if (name === 'weft_search') {
      const query = requiredString(args, 'query'); const limit = Number(args.limit ?? 10);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be 1–100');
      value = searchChunks(db, repo.id, query, limit).map(({ path, startLine, endLine, safeText, symbols }) => ({ path, startLine, endLine, symbols, snippet: safeText.split(/\r?\n/)[0] ?? '' }));
    } else if (name === 'weft_context') {
      const query = requiredString(args, 'query'); const budget = Number(args.budget ?? 1500);
      if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100_000) throw new Error('budget must be 1–100000');
      value = packContext(rankCandidates(searchChunks(db, repo.id, query, 100), query), budget, query);
    } else if (name === 'weft_read') {
      const path = requiredString(args, 'path'); const start = Number(args.startLine); const end = Number(args.endLine);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start > 1000) throw new Error('Invalid line range');
      const chunks = db.prepare(`SELECT c.start_line AS startLine, c.end_line AS endLine, c.safe_text AS text FROM chunks c JOIN files f ON f.id = c.file_id WHERE f.repo_id = ? AND f.path = ? AND c.end_line >= ? AND c.start_line <= ? ORDER BY c.start_line`).all(repo.id, path, start, end) as Array<{ startLine: number; endLine: number; text: string }>;
      value = chunks.map((chunk) => ({ ...chunk, text: chunk.text.split(/\r?\n/).slice(Math.max(0, start - chunk.startLine), end - chunk.startLine + 1).join('\n') }));
    } else if (name === 'weft_checkpoint' || name === 'weft_resume') {
      const taskId = requiredString(args, 'taskId');
      const task = db.prepare('SELECT id, repo_id FROM tasks WHERE id = ?').get(taskId) as { id: string; repo_id: string } | undefined;
      if (!task || task.repo_id !== repo.id) throw new Error(`Task not found: ${taskId}`);
      const git = await getWorkingTreeStatus(repo.rootPath); const fingerprint = computeWorkingTreeFingerprint(git, await getHeadCommit(repo.rootPath) ?? '', git.branch);
      value = name === 'weft_resume' ? resumeTask(db, taskId, fingerprint) : saveCheckpoint(db, { taskId, workingTreeFingerprint: fingerprint, objective: '', status: 'active', findings: [], decisions: [], verification: [], nextAction: '' });
    } else if (name === 'weft_health') value = await checkRepoHealth(repo.rootPath);
    else throw new Error(`Unknown tool: ${name}`);
    return { content: [{ type: 'text', text: redactSafe(JSON.stringify(value)) }], isError: false };
  };
}

export function serveMcp(db: Database.Database, repo: { id: string; rootPath: string }, streams = { input: process.stdin, output: process.stdout }): void {
  const handle = createMcpHandler(db, repo); const lines = createInterface({ input: streams.input });
  lines.on('line', async (line) => {
    let message: { id?: unknown; method?: string; params?: Args };
    try { message = JSON.parse(line) as typeof message; } catch { return; }
    if (!message.method || message.id === undefined) return;
    try { streams.output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: await handle(message.method, message.params) })}\n`); }
    catch (error) { streams.output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: redactSafe(error instanceof Error ? error.message : String(error)) } })}\n`); }
  });
}
