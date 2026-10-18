import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';
import { ingestTranscripts } from '../../../src/telemetry/transcripts.js';

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe('transcript ingestion', () => {
  it('ingests Claude and Codex usage idempotently and stores no message text', async () => {
    const home = await mkdtemp(join(tmpdir(), 'weft-telemetry-')); dirs.push(home);
    const claude = join(home, '.claude', 'projects', 'repo');
    const codex = join(home, '.codex', 'sessions', '2026', '01', '01');
    await mkdir(claude, { recursive: true }); await mkdir(codex, { recursive: true });
    await writeFile(join(claude, 'session.jsonl'), await readFile(new URL('./fixtures/claude.jsonl', import.meta.url), 'utf8'));
    await writeFile(join(codex, 'rollout-test.jsonl'), await readFile(new URL('./fixtures/codex.jsonl', import.meta.url), 'utf8'));
    const secret = 'ghp_FAKESECRET123456789012345678901234';

    const db = openDatabase(':memory:'); migrate(db);
    db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', 'c:/repo', 'repo', new Date().toISOString(), new Date().toISOString());
    try {
      await ingestTranscripts(db, { home }); await ingestTranscripts(db, { home });
      expect(db.prepare('SELECT COUNT(*) AS n FROM usage_events').get()).toEqual({ n: 3 });
      expect(db.prepare("SELECT input_tokens, output_tokens FROM usage_events WHERE id='claude-code:claude-1'").get()).toEqual({ input_tokens: 6, output_tokens: 2 });
      expect(db.prepare("SELECT input_tokens, output_tokens FROM usage_events WHERE id='codex:codex-1'").get()).toEqual({ input_tokens: 12, output_tokens: 6 });
      expect(db.prepare("SELECT repo_id FROM sessions WHERE id='claude-code:unregistered'").get()).toEqual({ repo_id: null });
      expect(JSON.stringify(db.prepare('SELECT * FROM usage_events').all())).not.toContain(secret);
      expect(db.prepare('SELECT SUM(calls) AS n FROM session_tool_calls').get()).toEqual({ n: 2 });
    } finally { db.close(); }
  });
});
