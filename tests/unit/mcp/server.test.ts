import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getGitRoot } from '../../../src/core/gitstate/gitRunner.js';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { createMcpHandler, findMcpRepo } from '../../../src/mcp/server.js';

const db = openDatabase(':memory:');
migrate(db);
const repoId = 'repo-test';
db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(repoId, process.cwd(), 'test', new Date().toISOString(), new Date().toISOString());
const generation = Number(db.prepare("INSERT INTO index_generations (repo_id, fingerprint, status, started_at, completed_at) VALUES (?, ?, 'ready', ?, ?)").run(repoId, 'fp', new Date().toISOString(), new Date().toISOString()).lastInsertRowid);
db.prepare("INSERT INTO repo_index_state (repo_id, active_generation, schema_version, updated_at) VALUES (?, ?, 2, ?)").run(repoId, generation, new Date().toISOString());
const fileId = Number(db.prepare('INSERT INTO files (repo_id, generation_id, path, content_hash, mtime_ms, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(repoId, generation, 'secret.ts', 'hash', 0, 80, new Date().toISOString()).lastInsertRowid);
db.prepare('INSERT INTO chunks (file_id, ordinal, start_line, end_line, content_hash, safe_text, token_estimate) VALUES (?, ?, ?, ?, ?, ?, ?)').run(fileId, 0, 1, 3, 'hash', 'const token = AKIA1234567890ABCDEF;\nsecond line\nthird line', 12);

describe('MCP server', () => {
  it('advertises the six Weft tools and initializes over JSON-RPC methods', async () => {
    const handle = createMcpHandler(db, { id: repoId, rootPath: process.cwd() });
    expect((await handle('initialize') as { capabilities: unknown }).capabilities).toEqual({ tools: {} });
    expect((await handle('tools/list') as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toHaveLength(6);
  });

  it('redacts planted secrets from every returned tool result', async () => {
    const handle = createMcpHandler(db, { id: repoId, rootPath: process.cwd() });
    const result = await handle('tools/call', { name: 'weft_search', arguments: { query: 'token' } });
    expect(JSON.stringify(result)).not.toContain('AKIA1234567890ABCDEF');
    expect(JSON.stringify(result)).toContain('[REDACTED_SECRET:');
  });

  it('reads only the requested line range', async () => {
    const handle = createMcpHandler(db, { id: repoId, rootPath: process.cwd() });
    const result = await handle('tools/call', { name: 'weft_read', arguments: { path: 'secret.ts', startLine: 2, endLine: 2 } });
    expect(JSON.stringify(result)).toContain('second line');
    expect(JSON.stringify(result)).not.toContain('third line');
  });

  it('returns a clear message when the MCP server cwd is outside a Git repository', async () => {
    const handle = createMcpHandler(db, null);
    const result = await handle('tools/call', { name: 'weft_search', arguments: { query: 'anything' } });
    expect(JSON.stringify(result)).toContain('Start the harness from inside a Git workspace');
  });

  it('resolves the MCP repository from a nested server cwd to its Git root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weft-mcp-cwd-'));
    try {
      const nested = join(root, 'nested'); await mkdir(nested);
      execFileSync('git', ['init', '-q'], { cwd: root });
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('nested-repo', root, 'nested', new Date().toISOString(), new Date().toISOString());
      expect(findMcpRepo(db, (await getGitRoot(nested))!)).toEqual({ id: 'nested-repo', rootPath: root });
    } finally {
      db.prepare('DELETE FROM repositories WHERE id = ?').run('nested-repo');
      await rm(root, { recursive: true, force: true });
    }
  });
});

afterAll(() => { db.close(); });
