import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';

describe('migrate', () => {
  it('applies V1 once and creates the complete schema', () => {
    const db = openDatabase(':memory:');
    try {
      expect(migrate(db)).toEqual([1]);
      expect(migrate(db)).toEqual([]);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").pluck().all();
      for (const table of ['schema_migrations', 'repositories', 'repo_config_overrides', 'index_generations', 'repo_index_state', 'files', 'symbols', 'edges', 'chunks', 'chunk_fts', 'tasks', 'checkpoints', 'sessions', 'usage_events', 'cache_diagnostics', 'migration_ledger']) {
        expect(tables).toContain(table);
      }
      expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it('rejects a database whose recorded migration checksum differs', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      db.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1').run('changed');
      expect(() => migrate(db)).toThrow(/checksum/i);
    } finally {
      db.close();
    }
  });
});
