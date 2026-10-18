import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveConfig } from '../../../src/config/manager.js';
import { ensureRepoOnboarded, indexWithinLimit } from '../../../src/onboarding/auto.js';
import { openDatabase } from '../../../src/storage/db.js';
import { migrate } from '../../../src/storage/migrator.js';

const dirs: string[] = [];
async function temp() { const path = await mkdtemp(join(tmpdir(), 'weft-auto-')); dirs.push(path); return path; }
async function gitRepo(root: string) { await import('node:fs/promises').then(({ mkdir }) => mkdir(root, { recursive: true })); execFileSync('git', ['init', '-q'], { cwd: root }); }
afterEach(async () => { await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('automatic onboarding', () => {
  it('skips non-Git, home, and disabled locations, then registers a Git repo and spawns a detached index child', async () => {
    const base = await temp(), home = join(base, 'home'), state = join(base, 'state'), config = join(base, 'config.json'), project = join(base, 'project');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(home, { recursive: true }));
    await gitRepo(home); await gitRepo(project);
    const spawnChild = vi.fn(() => ({ unref: vi.fn() }) as never);
    await saveConfig({ version: 1, repositories: [], autoOnboard: true, maxTrackedFiles: 20000 }, config);
    const opts = { stateDir: state, home, configPath: config, tempDir: join(base, 'not-temp'), spawnChild };
    expect((await ensureRepoOnboarded(join(parse(process.cwd()).root, 'weft-not-git-workspace'), opts)).reason).toBe('not-git');
    expect((await ensureRepoOnboarded(home, opts)).reason).toBe('protected');
    const added = await ensureRepoOnboarded(project, opts);
    expect(added.onboarded).toBe(true);
    expect(spawnChild).toHaveBeenCalledWith(process.execPath, [expect.any(String), 'index', expect.any(String)], expect.objectContaining({ detached: true, stdio: 'ignore', windowsHide: true }));
    expect((await ensureRepoOnboarded(project, opts)).reason).toBe('registered');
    await saveConfig({ version: 1, repositories: [], autoOnboard: false, maxTrackedFiles: 20000 }, config);
    expect((await ensureRepoOnboarded(join(base, 'another'), opts)).reason).toBe('disabled');
  });

  it('skips an index above the tracked-file limit and records a status note', async () => {
    const base = await temp(), root = join(base, 'repo'); await gitRepo(root);
    for (let i = 0; i < 3; i++) await writeFile(join(root, `file${i}.txt`), 'content');
    execFileSync('git', ['add', '.'], { cwd: root });
    const db = openDatabase(join(base, 'state')); migrate(db);
    db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('r', root, 'repo', new Date().toISOString(), new Date().toISOString());
    try {
      expect(await indexWithinLimit(root, 2, db, 'r')).toContain('more than 2 tracked files');
      expect(JSON.parse((db.prepare('SELECT config_json FROM repositories WHERE id = ?').get('r') as { config_json: string }).config_json).weftOnboardingNote).toContain('limit 2');
      expect(await indexWithinLimit(root, 3, db, 'r')).toBeNull();
    } finally { db.close(); }
  });
});
