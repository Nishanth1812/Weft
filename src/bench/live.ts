import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { estimateTokens } from '../core/estimate/tokenEstimator.js';
import { syncClaudeInstructions, CLAUDE_CODE_GUIDELINES } from '../integrations/claude-code/index.js';
import { installMcpConfig } from '../integrations/mcpConfig.js';
import { openDatabase } from '../storage/db.js';
import { migrate } from '../storage/migrator.js';
import { indexRepository } from '../indexer/indexer.js';
import { runBenchmark } from './runner.js';
import type { TaskDefinition, TrialCondition } from './types.js';

async function removeWeftSetup(repo: string): Promise<void> {
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const path = join(repo, name);
    let content: string;
    try { content = await readFile(path, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    content = content.replace(/(?:\r?\n)?<!-- BEGIN WEFT MANAGED BLOCK -->[\s\S]*?<!-- END WEFT MANAGED BLOCK -->(?:\r?\n)?/g, '\n');
    if (content.trim()) await writeFile(path, content, 'utf8'); else await rm(path, { force: true });
  }
  const configPath = join(repo, '.mcp.json');
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { mcpServers?: Record<string, unknown> };
    const hadWeft = Boolean(config.mcpServers && 'weft' in config.mcpServers);
    if (!hadWeft) return;
    delete config.mcpServers!.weft;
    if (!Object.keys(config.mcpServers!).length) delete config.mcpServers;
    if (Object.keys(config).length) await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    else await rm(configPath, { force: true });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

type SuiteTask = TaskDefinition & { prompt: string };
function execute(command: string, cwd: string, env = process.env): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, { cwd, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}
function usage(output: string): { tokens?: number; costMicros?: number } {
  try {
    const json = JSON.parse(output) as Record<string, unknown>;
    const usage = (json.usage && typeof json.usage === 'object' ? json.usage : json) as Record<string, unknown>;
    const tokens = Number(usage.total_tokens ?? usage.totalTokens ?? (Number(usage.input_tokens ?? usage.inputTokens ?? 0) + Number(usage.output_tokens ?? usage.outputTokens ?? 0)));
    const cost = Number(usage.cost_usd ?? usage.costUsd ?? json.cost_usd ?? json.costUsd);
    return { ...(Number.isFinite(tokens) && tokens > 0 ? { tokens } : {}), ...(Number.isFinite(cost) && cost >= 0 ? { costMicros: Math.round(cost * 1_000_000) } : {}) };
  } catch { return {}; }
}
export async function runLiveSuite(tasks: SuiteTask[], harnessTemplate: string, conditions: TrialCondition[] = ['A', 'B', 'C']) {
  if (!harnessTemplate.includes('{prompt}')) throw new Error('Harness template must include {prompt}.');
  return runBenchmark(tasks.map((task) => ({ ...task, run: async (condition) => {
    const work = await mkdtemp(join(tmpdir(), 'weft-bench-'));
    const repo = join(work, basename(resolve(task.repoPath)));
    const started = Date.now();
    try {
      await cp(resolve(task.repoPath), repo, { recursive: true, filter: (source) => !/[\\/](?:\.git|node_modules|dist|coverage)(?:[\\/]|$)/.test(source) });
      await removeWeftSetup(repo);
      if (condition !== 'A') await syncClaudeInstructions(repo, CLAUDE_CODE_GUIDELINES);
      if (condition === 'C') {
        await installMcpConfig('claude-code', { home: work, project: repo });
        const localAppData = join(work, 'weft-local');
        const state = process.platform === 'win32' ? join(localAppData, 'Weft', 'state') : join(work, 'weft-state', 'Weft');
        await mkdir(state, { recursive: true });
        const db = openDatabase(state);
        try {
          migrate(db);
          db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('bench', repo, 'bench', 'now', 'now');
          await indexRepository(db, 'bench', repo, { force: true });
        } finally { db.close(); }
        const configPath = join(repo, '.mcp.json');
        const config = JSON.parse(await readFile(configPath, 'utf8')) as { mcpServers: Record<string, Record<string, unknown>> };
        config.mcpServers.weft = { command: process.execPath, args: [resolve(process.argv[1] ?? 'dist/cli/index.js'), 'mcp', 'serve'], env: process.platform === 'win32' ? { LOCALAPPDATA: localAppData } : { XDG_STATE_HOME: join(work, 'weft-state') } };
        await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      }
      const prompt = task.prompt.replaceAll('{condition}', condition).replaceAll('{repoPath}', repo);
      const harness = await execute(harnessTemplate.replaceAll('{prompt}', JSON.stringify(prompt)).replaceAll('{repoPath}', JSON.stringify(repo)), repo);
      const parsed = usage(harness.stdout);
      const test = harness.code === 0 ? await execute(task.testCommand, repo) : { code: 1, stdout: '', stderr: harness.stderr };
      const success = harness.code === 0 && test.code === 0;
      const tokensUsed = parsed.tokens ?? estimateTokens(prompt + harness.stdout);
      return { success, durationMs: Date.now() - started, tokensUsed, costMicros: parsed.costMicros ?? 0, tokenProvenance: parsed.tokens !== undefined ? 'provider_reported' as const : 'estimated' as const, costProvenance: parsed.costMicros !== undefined ? 'provider_reported' as const : 'estimated' as const, ...(!success ? { error: harness.stderr || test.stderr || `Harness or test command failed (${harness.code}/${test.code}).` } : {}) };
    } finally { await rm(work, { recursive: true, force: true }); }
  } })), conditions);
}
export async function loadSuite(path: string): Promise<SuiteTask[]> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { tasks?: SuiteTask[] } | SuiteTask[];
  const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
  if (!tasks?.length || tasks.some((task) => !task.id || !task.prompt || !task.repoPath || !task.testCommand)) throw new Error('Suite must contain tasks with id, repoPath, prompt, and testCommand.');
  return tasks;
}
