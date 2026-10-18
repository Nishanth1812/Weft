import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { recordUsageEvent } from '../../../src/telemetry/ingest.js';

describe('recordUsageEvent', () => {
  it('records typed usage values with explicit provenance and empty raw metadata', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      const id = recordUsageEvent(db, {
        source: 'openai', provenance: 'provider_reported', observedAt: '2026-10-18T00:00:00.000Z',
        model: 'gpt-4o', inputTokens: 10, outputTokens: 5, costMicros: 75,
      });
      expect(db.prepare('SELECT id, provenance, input_tokens, output_tokens, cost_micros, raw_metadata_json FROM usage_events WHERE id = ?').get(id))
        .toEqual({ id, provenance: 'provider_reported', input_tokens: 10, output_tokens: 5, cost_micros: 75, raw_metadata_json: '{}' });
    } finally { db.close(); }
  });

  it('estimates cost when only model and token counts are supplied', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      const id = recordUsageEvent(db, {
        source: 'local', provenance: 'estimated', observedAt: '2026-10-18T00:00:00.000Z',
        model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 1_000_000,
      });
      expect(db.prepare('SELECT provenance, cost_micros FROM usage_events WHERE id = ?').get(id))
        .toEqual({ provenance: 'estimated', cost_micros: 12_500_000 });
    } finally { db.close(); }
  });

  it('ignores untyped payload fields that could contain prompt text or secrets', () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      const id = recordUsageEvent(db, {
        source: 'harness', provenance: 'harness_reported', observedAt: '2026-10-18T00:00:00.000Z',
        prompt: 'private prompt text', apiKey: 'secret', metadata: { sourceCode: 'private code' },
      } as never);
      const row = db.prepare('SELECT * FROM usage_events WHERE id = ?').get(id) as Record<string, unknown>;
      expect(JSON.stringify(row)).not.toMatch(/private prompt text|private code|secret/);
      expect(row.raw_metadata_json).toBe('{}');
    } finally { db.close(); }
  });
});
