import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupWeft } from '../../../src/integrations/setup.js';

const dirs: string[] = [];
async function home() { const path = await mkdtemp(join(tmpdir(), 'weft-setup-')); dirs.push(path); return path; }
afterEach(async () => { await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('global setup', () => {
  it('is idempotent and uninstall preserves foreign entries in every harness', async () => {
    const root = await home();
    await Promise.all([join(root, '.claude'), join(root, '.codex'), join(root, '.config', 'opencode')].map(async (path) => import('node:fs/promises').then(({ mkdir }) => mkdir(path, { recursive: true }))));
    await writeFile(join(root, '.claude', 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'foreign stop' }] }] }, foreign: true }));
    await writeFile(join(root, '.claude.json'), JSON.stringify({ mcpServers: { other: { command: 'other' } }, keep: 1 }));
    await writeFile(join(root, '.codex', 'config.toml'), '[other]\nvalue = 1\n');
    await writeFile(join(root, '.config', 'opencode', 'opencode.json'), JSON.stringify({ mcp: { other: { command: ['other'] } }, keep: true }));
    const runner = vi.fn(async () => false);
    await setupWeft({ home: root, runner });
    const snapshot = await Promise.all(['.claude/settings.json', '.claude.json', '.codex/config.toml', '.config/opencode/opencode.json', '.claude/CLAUDE.md', '.codex/AGENTS.md', '.config/opencode/AGENTS.md'].map((p) => readFile(join(root, p), 'utf8')));
    await setupWeft({ home: root, runner });
    expect(await Promise.all(['.claude/settings.json', '.claude.json', '.codex/config.toml', '.config/opencode/opencode.json', '.claude/CLAUDE.md', '.codex/AGENTS.md', '.config/opencode/AGENTS.md'].map((p) => readFile(join(root, p), 'utf8')))).toEqual(snapshot);
    await setupWeft({ home: root, uninstall: true });
    expect(JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'))).toEqual({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'foreign stop' }] }], SessionStart: [], PreCompact: [] }, foreign: true });
    expect(JSON.parse(await readFile(join(root, '.claude.json'), 'utf8'))).toEqual({ mcpServers: { other: { command: 'other' } }, keep: 1 });
    expect(await readFile(join(root, '.codex/config.toml'), 'utf8')).toBe('[other]\nvalue = 1\n');
    expect(JSON.parse(await readFile(join(root, '.config/opencode/opencode.json'), 'utf8'))).toEqual({ mcp: { other: { command: ['other'] } }, keep: true });
  });

  it('dry-run writes nothing and uses Claude CLI user-scope commands before JSON fallback', async () => {
    const root = await home(); const claude = join(root, '.claude');
    await (await import('node:fs/promises')).mkdir(claude);
    const preview = await setupWeft({ home: root, dryRun: true, runner: vi.fn() });
    expect(preview.length).toBeGreaterThan(0);
    await expect(readFile(join(claude, 'settings.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    const runner = vi.fn(async () => false);
    await setupWeft({ home: root, harnesses: ['claude-code'], runner });
    expect(runner).toHaveBeenNthCalledWith(1, ['mcp', 'list'], 1500);
    expect(runner).toHaveBeenNthCalledWith(2, ['mcp', 'add', '--scope', 'user', 'weft', '--', 'weft', 'mcp', 'serve'], 2000);
    expect(JSON.parse(await readFile(join(root, '.claude.json'), 'utf8')).mcpServers.weft.command).toBe('weft');
    const cli = vi.fn(async (args: string[]) => args[1] === 'add');
    await setupWeft({ home: root, harnesses: ['claude-code'], runner: cli });
    expect(cli).toHaveBeenNthCalledWith(2, ['mcp', 'add', '--scope', 'user', 'weft', '--', 'weft', 'mcp', 'serve'], 2000);
    const already = vi.fn(async () => true);
    await setupWeft({ home: root, harnesses: ['claude-code'], runner: already });
    expect(already).toHaveBeenCalledTimes(1);
  });
});
