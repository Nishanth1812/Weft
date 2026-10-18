import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { createMcpHandler } from '../../../src/mcp/server.js';

const db = openDatabase(':memory:');
migrate(db);
const repoId = 'repo-test';
db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(repoId, process.cwd(), 'test', new Date().toISOString(), new Date().toISOString());
const generation = Number(db.prepare("INSERT INTO index_generations (repo_id, fingerprint, status, started_at, completed_at) VALUES (?, ?, 'ready', ?, ?)").run(repoId, 'fp', new Date().toISOString(), new Date().toISOString()).lastInsertRowid);
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
});

afterAll(() => { db.close(); });
