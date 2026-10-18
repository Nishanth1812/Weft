import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMcpConfig } from '../../../src/integrations/mcpConfig.js';
import { runCommand } from '../../../src/cli/commands/index.js';

const dirs: string[] = [];
async function tempHome() { const dir = await mkdtemp(join(tmpdir(), 'weft-mcp-')); dirs.push(dir); return dir; }
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('MCP harness config', () => {
  it('dry run writes nothing and install merges existing JSON entries idempotently', async () => {
    const home = await tempHome();
    const preview = await installMcpConfig('opencode', { home, dryRun: true });
    await expect(readFile(preview.path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    const first = await installMcpConfig('opencode', { home });
    const existing = JSON.parse(await readFile(first.path, 'utf8'));
    expect(existing.mcp.weft.command).toEqual(['weft', 'mcp', 'serve']);
    expect((await installMcpConfig('opencode', { home })).modified).toBe(false);
  });

  it('preserves other TOML server sections', async () => {
    const home = await tempHome();
    const file = join(home, '.codex', 'config.toml');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(home, '.codex'), { recursive: true });
    await writeFile(file, '[mcp_servers.other]\ncommand = "other"\n');
    await installMcpConfig('codex', { home });
    const content = await readFile(file, 'utf8');
    expect(content).toContain('[mcp_servers.other]');
    expect(content).toContain('[mcp_servers.weft]');
  });

  it('treats T3 as coverage through the user Claude and Codex configs', async () => {
    const home = await tempHome();
    const result = await installMcpConfig('t3', { home });
    expect(result.path).toContain('.claude.json');
    expect(result.path).toContain('.codex');
    expect(await readFile(join(home, '.claude.json'), 'utf8')).toContain('"weft"');
    expect(await readFile(join(home, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.weft]');
    await expect(readFile(join(home, '.t3', 'mcp.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('accepts T3 in the MCP install command and reports the two user configs', async () => {
    const home = await tempHome();
    vi.stubEnv('HOME', home);
    const result = await runCommand(['mcp', 'install', '--harness', 't3']);
    expect(result.code).toBe(0);
    expect((result.data as { path: string }).path).toContain('.claude.json');
    expect((result.data as { path: string }).path).toContain('.codex');
  });

  it('repairs stale node-direct paths in Weft-owned MCP entries and preserves foreign entries', async () => {
    const home = await tempHome();
    await (await import('node:fs/promises')).mkdir(join(home, '.codex'), { recursive: true });
    await (await import('node:fs/promises')).mkdir(join(home, '.config', 'opencode'), { recursive: true });
    await (await import('node:fs/promises')).writeFile(join(home, '.claude.json'), JSON.stringify({ mcpServers: { weft: { command: 'node', args: ['C:/old/weft/cli.js', 'mcp', 'serve'] }, other: { command: 'other' } } }));
    await (await import('node:fs/promises')).writeFile(join(home, '.codex', 'config.toml'), '[mcp_servers.weft]\ncommand = "node"\nargs = ["C:/old/weft/cli.js", "mcp", "serve"]\n\n[mcp_servers.other]\ncommand = "other"\n');
    await installMcpConfig('claude-code', { home });
    await installMcpConfig('codex', { home });
    expect(JSON.parse(await readFile(join(home, '.claude.json'), 'utf8'))).toEqual({ mcpServers: { weft: { command: 'weft', args: ['mcp', 'serve'] }, other: { command: 'other' } } });
    expect(await readFile(join(home, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.other]');
    expect(await readFile(join(home, '.codex', 'config.toml'), 'utf8')).toContain('command = "weft"');
  });
});
