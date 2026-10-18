import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { indexRepository } from '../../../src/indexer/indexer.js';

describe('indexRepository', () => {
  let root: string;
  let db: ReturnType<typeof openDatabase>;
  afterEach(async () => { db?.close(); if (root) await rm(root, { recursive: true, force: true }); });

  it('publishes an FTS-searchable generation atomically', async () => {
    root = await mkdtemp(join(tmpdir(), 'weft-indexer-'));
    db = openDatabase(':memory:'); migrate(db);
    db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', root, 'r', 'now', 'now');
    await writeFile(join(root, 'a.ts'), 'export function distinctiveSearchTerm() { return true; }');
    const first = await indexRepository(db, 'r', root);
    const unchanged = await indexRepository(db, 'r', root);
    expect(unchanged).toMatchObject({ generationId: first.generationId, reusedFiles: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM chunk_fts WHERE chunk_fts MATCH 'distinctiveSearchTerm'").get()).toEqual({ count: 1 });
    db.prepare('UPDATE repo_index_state SET schema_version = 1 WHERE repo_id = ?').run('r');
    const rebuilt = await indexRepository(db, 'r', root);
    expect(rebuilt.generationId).not.toBe(first.generationId);
    expect(db.prepare('SELECT schema_version FROM repo_index_state WHERE repo_id = ?').get('r')).toEqual({ schema_version: 2 });
    const active1 = db.prepare('SELECT active_generation FROM repo_index_state WHERE repo_id = ?').get('r') as { active_generation: number };
    db.exec("CREATE TRIGGER reject_test_chunk BEFORE INSERT ON chunks WHEN NEW.safe_text LIKE '%fail transaction%' BEGIN SELECT RAISE(ABORT, 'test insertion failure'); END");
    await writeFile(join(root, 'a.ts'), 'export const failure = "fail transaction";');
    await expect(indexRepository(db, 'r', root)).rejects.toThrow('test insertion failure');
    expect(db.prepare('SELECT active_generation FROM repo_index_state WHERE repo_id = ?').get('r')).toEqual(active1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM chunk_fts WHERE chunk_fts MATCH 'distinctiveSearchTerm'").get()).toEqual({ count: 2 });
    db.exec('DROP TRIGGER reject_test_chunk');
    await writeFile(join(root, 'a.ts'), 'export function changedSearchTerm() { return true; }');
    const second = await indexRepository(db, 'r', root);
    const active2 = db.prepare('SELECT active_generation FROM repo_index_state WHERE repo_id = ?').get('r') as { active_generation: number };
    expect(second.generationId).not.toBe(first.generationId);
    expect(active2.active_generation).not.toBe(active1.active_generation);
    expect(db.prepare('SELECT status FROM index_generations WHERE id = ?').get(active2.active_generation)).toEqual({ status: 'ready' });
    expect(db.prepare("SELECT COUNT(*) AS count FROM chunk_fts WHERE chunk_fts MATCH 'changedSearchTerm'").get()).toEqual({ count: 1 });
  });
});
