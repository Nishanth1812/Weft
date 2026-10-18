import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installMcpConfig } from '../../../src/integrations/mcpConfig.js';

const dirs: string[] = [];
async function tempHome() { const dir = await mkdtemp(join(tmpdir(), 'weft-mcp-')); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

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
});
