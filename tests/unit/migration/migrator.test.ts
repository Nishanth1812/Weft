import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateDevPulse } from '../../../src/migration/devpulse/migrator.js';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';

const originalLocalAppData = process.env.LOCALAPPDATA;
const originalAppData = process.env.APPDATA;
const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'weft-devpulse-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = originalLocalAppData;
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('migrateDevPulse', () => {
  it('imports repositories, goals and notes once without modifying the source', async () => {
    const root = await tempDir();
    const source = join(root, 'devpulse');
    const repo = join(root, 'project');
    const state = join(root, 'state');
    process.env.LOCALAPPDATA = state;
    process.env.APPDATA = state;
    await mkdir(join(source, 'notes'), { recursive: true });
    await mkdir(repo);
    await writeFile(join(source, 'config.toml'), `repositories = [\n  { name = "Project", path = "${repo.replace(/\\/g, '\\\\')}" }\n]\n`);
    await writeFile(join(source, 'goals.md'), '# Goals\nShip safely.\n');
    await writeFile(join(source, 'notes', 'Project.md'), `# Progress\nReviewed the indexer.\n${'x'.repeat(20 * 1024)}`);
    const sourceBefore = await readFile(join(source, 'notes', 'Project.md'), 'utf8');
    const configBefore = await readFile(join(source, 'config.toml'), 'utf8');
    const goalsBefore = await readFile(join(source, 'goals.md'), 'utf8');

    const first = await migrateDevPulse({ sourcePath: source });
    const second = await migrateDevPulse({ sourcePath: source });
    const db = openDatabase(join(state, 'weft', 'state'));
    try {
      migrate(db);
      expect(db.prepare('SELECT display_name FROM repositories').all()).toEqual([{ display_name: 'Project' }]);
      expect(db.prepare('SELECT COUNT(*) AS count FROM checkpoints').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM migration_ledger').get()).toEqual({ count: 3 });
      const payload = JSON.parse((db.prepare('SELECT payload_json FROM checkpoints').get() as { payload_json: string }).payload_json);
      expect(payload.source).toBe('devpulse-import');
      expect(Buffer.byteLength((db.prepare('SELECT payload_json FROM checkpoints').get() as { payload_json: string }).payload_json)).toBeLessThanOrEqual(16 * 1024);
      expect(first.imported).toBe(3);
      expect(second.imported).toBe(0);
      expect(second.skipped).toBe(3);
      expect(await readFile(join(state, 'weft', 'instructions', 'intent.md'), 'utf8')).toContain('Ship safely');
      expect(await readFile(join(source, 'notes', 'Project.md'), 'utf8')).toBe(sourceBefore);
      expect(await readFile(join(source, 'config.toml'), 'utf8')).toBe(configBefore);
      expect(await readFile(join(source, 'goals.md'), 'utf8')).toBe(goalsBefore);
    } finally { db.close(); }
  });

  it('preserves an existing intent and keeps dry runs from writing state', async () => {
    const root = await tempDir();
    const source = join(root, 'devpulse');
    const state = join(root, 'state');
    process.env.LOCALAPPDATA = state;
    process.env.APPDATA = state;
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'goals.md'), 'Imported goals');
    await migrateDevPulse({ sourcePath: source, dryRun: true });
    expect(await import('node:fs/promises').then(({ access }) => access(state).then(() => true, () => false))).toBe(false);
    await mkdir(join(state, 'weft', 'instructions'), { recursive: true });
    await writeFile(join(state, 'weft', 'instructions', 'intent.md'), 'User intent');

    await migrateDevPulse({ sourcePath: source });
    expect(await readFile(join(state, 'weft', 'instructions', 'intent.md'), 'utf8')).toBe('User intent');
    expect(await readFile(join(state, 'weft', 'instructions', 'intent.devpulse.md'), 'utf8')).toBe('Imported goals');
  });
});
