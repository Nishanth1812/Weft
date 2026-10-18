import { describe, expect, it } from 'vitest';
import { getUserPaths, normalizeCanonicalPath } from '../../../src/config/paths.js';

describe('config paths', () => {
  it('uses platform environment roots and forward slash paths', () => {
    expect(getUserPaths('win32', { APPDATA: 'C:\\Users\\u\\Roaming', LOCALAPPDATA: 'C:\\Users\\u\\Local' })).toEqual({
      config: 'C:/Users/u/Roaming/weft', instructions: 'C:/Users/u/Roaming/weft/instructions',
      state: 'C:/Users/u/Local/weft/state', cache: 'C:/Users/u/Local/weft/cache',
    });
    expect(getUserPaths('linux', { HOME: '/home/u', XDG_CONFIG_HOME: '/tmp/config', XDG_STATE_HOME: '/tmp/state', XDG_CACHE_HOME: '/tmp/cache' })).toMatchObject({
      config: '/tmp/config/weft', state: '/tmp/state/weft', cache: '/tmp/cache/weft',
    });
  });

  it('resolves existing paths canonically', async () => {
    const { mkdtemp, realpath, rm, symlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'weft-path-'));
    try {
      const link = join(dir, 'link');
      await symlink(dir, link, 'junction');
      expect(await normalizeCanonicalPath(link)).toBe((await realpath(dir)).replace(/\\/g, '/'));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
