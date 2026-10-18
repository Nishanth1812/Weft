import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { createRepositories } from '../../../src/storage/repositories.js';

describe('storage repositories', () => {
  it('supports typed inserts and reads and cascades repository deletion', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      const repos = createRepositories(db);
      repos.repositories.insert({ id: 'repo', root_path: '/repo', display_name: 'repo', created_at: 'now', last_seen_at: 'now' });
      expect(repos.repositories.get('repo')?.root_path).toBe('/repo');
      const generationId = repos.indexGenerations.insert({ repo_id: 'repo', fingerprint: 'fp', status: 'ready', started_at: 'now' });
      const fileId = repos.files.insert({ repo_id: 'repo', generation_id: generationId, path: 'src/a.ts', content_hash: 'hash', mtime_ms: 1, size_bytes: 2, indexed_at: 'now' });
      const symbolId = repos.symbols.insert({ file_id: fileId, name: 'run', kind: 'function', start_line: 1, end_line: 2 });
      const chunkId = repos.chunks.insert({ file_id: fileId, ordinal: 0, start_line: 1, end_line: 2, content_hash: 'hash', safe_text: 'run the parser', token_estimate: 3 });
      expect(repos.symbols.get(symbolId)?.name).toBe('run');
      expect(repos.chunks.get(chunkId)?.safe_text).toBe('run the parser');
      repos.repositories.delete('repo');
      expect(repos.repositories.get('repo')).toBeUndefined();
      expect(repos.files.get(fileId)).toBeUndefined();
      expect(repos.symbols.get(symbolId)).toBeUndefined();
      expect(repos.chunks.get(chunkId)).toBeUndefined();
      expect(db.prepare('SELECT COUNT(*) AS count FROM chunk_fts').get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it('keeps FTS5 synchronized on chunk insert, update and delete', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      const repos = createRepositories(db);
      repos.repositories.insert({ id: 'repo', root_path: '/repo', display_name: 'repo', created_at: 'now', last_seen_at: 'now' });
      const generationId = repos.indexGenerations.insert({ repo_id: 'repo', fingerprint: 'fp', status: 'ready', started_at: 'now' });
      const fileId = repos.files.insert({ repo_id: 'repo', generation_id: generationId, path: 'a.ts', content_hash: 'h', mtime_ms: 1, size_bytes: 1, indexed_at: 'now' });
      const id = repos.chunks.insert({ file_id: fileId, ordinal: 0, start_line: 1, end_line: 1, content_hash: 'h', safe_text: 'alpha search phrase', token_estimate: 3 });
      const search = (term: string) => db.prepare('SELECT rowid FROM chunk_fts WHERE chunk_fts MATCH ?').all(term);
      expect(search('alpha')).toHaveLength(1);
      repos.chunks.update(id, { safe_text: 'beta search phrase' });
      expect(search('alpha')).toHaveLength(0);
      expect(search('beta')).toHaveLength(1);
      repos.chunks.delete(id);
      expect(search('beta')).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('provides CRUD helpers for tasks and checkpoints', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      const repos = createRepositories(db);
      repos.repositories.insert({ id: 'repo', root_path: '/repo', display_name: 'repo', created_at: 'now', last_seen_at: 'now' });
      repos.tasks.insert({ id: 'task', repo_id: 'repo', title: 'work', status: 'active', created_at: 'now', updated_at: 'now' });
      expect(repos.tasks.get('task')?.title).toBe('work');
      repos.tasks.update('task', { status: 'complete' });
      expect(repos.tasks.get('task')?.status).toBe('complete');
      repos.checkpoints.insert({ id: 'checkpoint', task_id: 'task', schema_version: 1, working_tree_fingerprint: 'fp', payload_json: '{}', created_at: 'now' });
      expect(repos.checkpoints.get('checkpoint')?.task_id).toBe('task');
      repos.checkpoints.delete('checkpoint');
      repos.tasks.delete('task');
      expect(repos.tasks.get('task')).toBeUndefined();
      expect(repos.checkpoints.get('checkpoint')).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
