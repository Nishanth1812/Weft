import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getGitRoot } from '../../../src/core/gitstate/gitRunner.js';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { createMcpHandler, findMcpRepo, serveMcp } from '../../../src/mcp/server.js';
import { indexRepository } from '../../../src/indexer/indexer.js';
import { createTask, recordVerification, saveCheckpoint } from '../../../src/memory/taskManager.js';

const roots: string[] = [];
async function fixture() {
  const rootPath = await mkdtemp(join(tmpdir(), 'weft-mcp-')); roots.push(rootPath);
  execFileSync('git', ['init', '-q'], { cwd: rootPath });
  await writeFile(join(rootPath, 'sample.ts'), 'export const marker = "first content";\nconst token = AKIA1234567890ABCDEF;\nsecond line\nthird line\n');
  const db = openDatabase(':memory:'); migrate(db);
  const repoId = 'repo-test';
  db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(repoId, rootPath, 'test', new Date().toISOString(), new Date().toISOString());
  await indexRepository(db, repoId, rootPath, { force: true });
  return { db, repoId, rootPath };
}
const call = (handle: ReturnType<typeof createMcpHandler>, name: string, args: Record<string, unknown> = {}) => handle('tools/call', { name, arguments: args });

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('MCP server', () => {
  it('advertises six tools and initializes', async () => {
    const { db, repoId, rootPath } = await fixture();
    try {
      const handle = createMcpHandler(db, { id: repoId, rootPath });
      expect((await handle('initialize') as { capabilities: unknown }).capabilities).toEqual({ tools: {} });
      expect((await handle('tools/list') as { tools: unknown[] }).tools).toHaveLength(6);
    } finally { db.close(); }
  });

  it('redacts secrets and returns compact non-JSON search/context text', async () => {
    const { db, repoId, rootPath } = await fixture();
    try {
      const handle = createMcpHandler(db, { id: repoId, rootPath });
      const search = await call(handle, 'weft_search', { query: 'first content' });
      const context = await call(handle, 'weft_context', { query: 'first content' });
      const searchText = (search as { content: Array<{ text: string }> }).content[0]!.text;
      const read = await call(handle, 'weft_read', { path: 'sample.ts', startLine: 2, endLine: 2 });
      expect(JSON.stringify(read)).not.toContain('AKIA1234567890ABCDEF'); expect(JSON.stringify(read)).toContain('[REDACTED_SECRET:');
      expect(searchText).not.toMatch(/^\s*[{[]/); expect((context as { content: Array<{ text: string }> }).content[0]!.text).not.toMatch(/^\s*[{[]/);
    } finally { db.close(); }
  });

  it('reads only the requested lines and rejects traversal, outside absolute paths, and sensitive files', async () => {
    const { db, repoId, rootPath } = await fixture();
    const outside = join(rootPath, '..', 'outside-secret.ts'); await writeFile(outside, 'outside');
    const outsideDir = await mkdtemp(join(tmpdir(), 'weft-mcp-outside-')); roots.push(outsideDir);
    await writeFile(join(outsideDir, 'secret.ts'), 'outside through junction');
    await symlink(outsideDir, join(rootPath, 'external'), 'junction');
    await writeFile(join(rootPath, '.env'), 'KEY=value');
    try {
      const handle = createMcpHandler(db, { id: repoId, rootPath });
      const result = await call(handle, 'weft_read', { path: 'sample.ts', startLine: 3, endLine: 3 });
      expect(JSON.stringify(result)).toContain('second line'); expect(JSON.stringify(result)).not.toContain('third line');
      await expect(call(handle, 'weft_read', { path: '../outside-secret.ts', startLine: 1, endLine: 1 })).rejects.toThrow();
      await expect(call(handle, 'weft_read', { path: outside, startLine: 1, endLine: 1 })).rejects.toThrow();
      await expect(call(handle, 'weft_read', { path: 'external/secret.ts', startLine: 1, endLine: 1 })).rejects.toThrow('Path must be inside');
      await expect(call(handle, 'weft_read', { path: '.env', startLine: 1, endLine: 1 })).rejects.toThrow('Sensitive');
    } finally { db.close(); await rm(outside, { force: true }); }
  });

  it('refreshes after edits while throttling concurrent search calls', async () => {
    const { db, repoId, rootPath } = await fixture(); let runs = 0;
    execFileSync('git', ['add', 'sample.ts'], { cwd: rootPath });
    const handle = createMcpHandler(db, { id: repoId, rootPath }, { index: async (...args) => { runs++; return indexRepository(...args); } });
    try {
      await call(handle, 'weft_context', { query: 'first content' });
      await writeFile(join(rootPath, 'sample.ts'), 'export const uniqueNeedle = "fresh-index-content";\nexport const marker = "first content";\n');
      const results = await Promise.all(Array.from({ length: 8 }, () => call(handle, 'weft_search', { query: 'fresh-index-content' })));
      expect(JSON.stringify(results)).toContain('fresh-index-content'); expect(runs).toBe(2);
    } finally { db.close(); }
  });

  it('records telemetry and creates a checkpoint without a task id', async () => {
    const { db, repoId, rootPath } = await fixture();
    try {
      const handle = createMcpHandler(db, { id: repoId, rootPath });
      await call(handle, 'weft_search', { query: 'marker' });
      expect(db.prepare('SELECT tool FROM tool_calls WHERE repo_id = ?').get(repoId)).toEqual({ tool: 'weft_search' });
      await call(handle, 'weft_checkpoint', { objective: 'continue work' });
      expect(db.prepare('SELECT count(*) AS n FROM checkpoints').get()).toMatchObject({ n: 1 });
    } finally { db.close(); }
  });

  it('includes recorded verification in resume output', async () => {
    const { db, repoId, rootPath } = await fixture();
    try {
      const task = createTask(db, repoId, 'verification test');
      saveCheckpoint(db, { taskId: task.id, workingTreeFingerprint: 'old', objective: 'check', status: 'active', findings: [], decisions: [], verification: [], nextAction: 'resume' });
      recordVerification(db, task.id, { command: 'npm test', exitCode: 1, durationMs: 15, outputTail: 'expected failure detail', ranAt: 'now', changedFiles: [] });
      const result = await call(createMcpHandler(db, { id: repoId, rootPath }), 'weft_resume', { taskId: task.id });
      expect(JSON.stringify(result)).toContain('Verification: npm test'); expect(JSON.stringify(result)).toContain('expected failure detail');
    } finally { db.close(); }
  });

  it('auto-checkpoints on input close and does not hang', async () => {
    const { db, repoId, rootPath } = await fixture();
    const task = createTask(db, repoId, 'auto checkpoint');
    const input = new PassThrough(); const output = new PassThrough();
    try {
      serveMcp(db, { id: repoId, rootPath }, { input, output }); input.end();
      const deadline = Date.now() + 5000;
      let checkpoint = { n: 0 };
      while (Date.now() < deadline && checkpoint.n === 0) {
        checkpoint = db.prepare('SELECT count(*) AS n FROM checkpoints WHERE task_id = ?').get(task.id) as { n: number };
        if (!checkpoint.n) await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(checkpoint).toMatchObject({ n: 1 });
    } finally { input.destroy(); output.destroy(); db.close(); }
  });

  it('resolves repository from nested cwd to its Git root', async () => {
    const { db, repoId, rootPath } = await fixture();
    try { expect(findMcpRepo(db, (await getGitRoot(join(rootPath, 'nested')) ?? resolve(rootPath)))).toEqual({ id: repoId, rootPath }); }
    finally { db.close(); }
  });
});
