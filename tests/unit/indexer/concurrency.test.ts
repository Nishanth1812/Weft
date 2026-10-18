import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { indexRepository } from '../../../src/indexer/indexer.js';

describe('indexRepository concurrency', () => {
  const dirs: string[] = [];
  afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

  it('serialises concurrent indexers on a file database and leaves one consistent active generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weft-conc-repo-')); const state = await mkdtemp(join(tmpdir(), 'weft-conc-state-')); dirs.push(root, state);
    await writeFile(join(root, 'a.ts'), 'export function alpha() { return 1; }\n');
    await writeFile(join(root, 'b.ts'), 'export function beta() { return 2; }\n');
    const connections = Array.from({ length: 4 }, () => openDatabase(state));
    try {
      migrate(connections[0]!);
      connections[0]!.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', root, 'r', 'now', 'now');
      const summaries = await Promise.all(connections.map((db) => indexRepository(db, 'r', root, { force: true })));
      expect(summaries.every((summary) => summary.files === 2)).toBe(true);
      const db = connections[0]!;
      const active = (db.prepare('SELECT active_generation AS id FROM repo_index_state WHERE repo_id = ?').get('r') as { id: number }).id;
      expect(db.prepare('SELECT COUNT(*) AS n FROM files WHERE generation_id = ?').get(active)).toEqual({ n: 2 });
      expect(db.prepare("SELECT COUNT(*) AS n FROM index_generations WHERE status != 'ready'").get()).toEqual({ n: 0 });
    } finally { connections.forEach((db) => db.close()); }
  });

  it('replaces a lock left by a dead process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weft-conc-repo-')); const state = await mkdtemp(join(tmpdir(), 'weft-conc-state-')); dirs.push(root, state);
    await writeFile(join(root, 'a.ts'), 'export const a = 1;\n');
    const db = openDatabase(state);
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', root, 'r', 'now', 'now');
      await writeFile(`${db.name}.${createHash('sha1').update('r').digest('hex')}.index.lock`, JSON.stringify({ pid: 2_147_483_000, at: Date.now() }));
      expect((await indexRepository(db, 'r', root)).files).toBe(1);
    } finally { db.close(); }
  });
});
