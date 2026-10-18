import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, saveConfig } from '../../../src/config/manager.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });
describe('config manager', () => {
  it('defaults missing or invalid fields and atomically writes valid config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weft-config-')); dirs.push(dir);
    expect(await loadConfig(join(dir, 'config.json'))).toEqual({ version: 1, repositories: [], autoOnboard: true, maxTrackedFiles: 20_000 });
    await saveConfig({ version: 1, repositories: [], autoOnboard: true, maxTrackedFiles: 20_000 }, join(dir, 'config.json'));
    expect(JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'))).toEqual({ version: 1, repositories: [], autoOnboard: true, maxTrackedFiles: 20_000 });
    expect(await loadConfig(join(dir, 'config.json'))).toEqual({ version: 1, repositories: [], autoOnboard: true, maxTrackedFiles: 20_000 });
  });
});
