import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { getCacheDiagnostics, getCostSummary, listSessions } from '../../../src/telemetry/analytics.js';

describe('telemetry analytics', () => {
  it('groups costs by model, harness, and repository while separating reported and estimated totals', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
        .run('repo-1', '/repo', 'sample', '2026-01-01', '2026-01-01');
      db.prepare('INSERT INTO sessions (id, repo_id, harness, model, started_at) VALUES (?, ?, ?, ?, ?)')
        .run('session-1', 'repo-1', 'codex', 'gpt-4o', '2026-10-01');
      const insert = db.prepare('INSERT INTO usage_events (id, session_id, source, provenance, observed_at, model, input_tokens, output_tokens, cost_micros) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insert.run('e1', 'session-1', 'api', 'provider_reported', '2026-10-02', 'gpt-4o', 10, 4, 100);
      insert.run('e2', 'session-1', 'local', 'estimated', '2026-10-03', 'gpt-4o', 20, 8, 50);
      insert.run('e3', 'session-1', 'api', 'harness_reported', '2026-10-04', 'other-model', 1, 1, 25);

      const model = getCostSummary(db, { by: 'model' });
      expect(model.totals).toEqual({ providerReportedCostMicros: 100, estimatedCostMicros: 50, otherCostMicros: 25, totalCostMicros: 175, eventCount: 3 });
      expect(model.groups).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'gpt-4o', providerReportedCostMicros: 100, estimatedCostMicros: 50 }),
      ]));
      expect(getCostSummary(db, { by: 'harness' }).groups[0]?.key).toBe('codex');
      expect(getCostSummary(db, { by: 'repo' }).groups[0]?.key).toBe('sample');
      expect(listSessions(db)).toHaveLength(1);
    } finally { db.close(); }
  });

  it('aggregates cache hit and miss tokens with a since filter', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      const insert = db.prepare('INSERT INTO cache_diagnostics (observed_at, cache_kind, hit_tokens, miss_tokens, provenance) VALUES (?, ?, ?, ?, ?)');
      insert.run('2026-10-01', 'prompt', 8, 2, 'provider_reported');
      insert.run('2026-10-03', 'prompt', 4, 6, 'local_parsed');
      expect(getCacheDiagnostics(db, { since: '2026-10-02' })).toEqual({ hitTokens: 4, missTokens: 6, diagnosticsCount: 1, byKind: [{ cacheKind: 'prompt', hitTokens: 4, missTokens: 6, diagnosticsCount: 1 }] });
    } finally { db.close(); }
  });
});
