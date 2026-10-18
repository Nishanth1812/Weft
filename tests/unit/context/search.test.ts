import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { searchChunks } from '../../../src/context/search.js';

describe('searchChunks', () => {
  it('searches within the repository and returns normalized BM25 with safe line metadata', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r1', '/', 'r1', 'now', 'now');
      const generation = Number(db.prepare("INSERT INTO index_generations (repo_id, fingerprint, status, started_at) VALUES ('r1', 'f', 'ready', 'now')").run().lastInsertRowid);
      db.prepare("INSERT INTO repo_index_state (repo_id, active_generation, schema_version, updated_at) VALUES ('r1', ?, 2, 'now')").run(generation);
      const file = Number(db.prepare("INSERT INTO files (repo_id, generation_id, path, content_hash, mtime_ms, size_bytes, indexed_at) VALUES ('r1', ?, 'src/a.ts', 'h', 0, 20, 'now')").run(generation).lastInsertRowid);
      db.prepare("INSERT INTO chunks (file_id, ordinal, start_line, end_line, content_hash, safe_text, token_estimate) VALUES (?, 0, 4, 6, 'h', 'needle needle distinctive', 8)").run(file);
      const hits = searchChunks(db, 'r1', 'needle');
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ path: 'src/a.ts', startLine: 4, endLine: 6, safeText: 'needle needle distinctive' });
      expect(hits[0]!.normalizedBM25).toBeGreaterThan(0);
      expect(hits[0]!.normalizedBM25).toBeLessThanOrEqual(1);
      expect(searchChunks(db, 'other', 'needle')).toEqual([]);
    } finally { db.close(); }
  });

  it('treats FTS operators in user input as literal terms', () => {
    const db = openDatabase(':memory:');
    try { migrate(db); expect(searchChunks(db, 'r', '" OR * NEAR(')).toEqual([]); }
    finally { db.close(); }
  });
});
