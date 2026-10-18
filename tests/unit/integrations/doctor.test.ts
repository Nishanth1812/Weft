import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkIntegrations } from '../../../src/integrations/doctor.js';
import { CLAUDE_CODE_GUIDELINES } from '../../../src/integrations/claude-code/index.js';
import { CODEX_GUIDELINES } from '../../../src/integrations/codex/index.js';
import { syncInstructions } from '../../../src/integrations/instructions.js';

const dirs: string[] = [];
async function home() { const path = await mkdtemp(join(tmpdir(), 'weft-doctor-')); dirs.push(path); return path; }
afterEach(async () => { await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('integration doctor checks', () => {
  it('reports missing entries with harness-specific repair commands', async () => {
    const checks = await checkIntegrations(await home());
    expect(checks.find((check) => check.id === 'claude-code hooks')).toMatchObject({ status: 'missing', fix: 'weft setup --harness claude-code' });
    expect(checks.find((check) => check.id === 'codex MCP')).toMatchObject({ status: 'missing', fix: 'weft setup --harness codex' });
  });

  it('distinguishes stale node-direct paths from missing MCP entries and checks managed blocks', async () => {
    const root = await home();
    await mkdir(join(root, '.claude'), { recursive: true });
    await mkdir(join(root, '.codex'), { recursive: true });
    await mkdir(join(root, '.config', 'opencode'), { recursive: true });
    await writeFile(join(root, '.claude', 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ command: 'node "C:/removed/weft/cli.js" hook session-start # weft-hook' }] }] } }));
    await writeFile(join(root, '.claude.json'), JSON.stringify({ mcpServers: { weft: { command: 'missing-weft-command', args: ['mcp', 'serve'] } } }));
    await writeFile(join(root, '.codex', 'config.toml'), '[mcp_servers.weft]\ncommand = "weft"\nargs = ["mcp", "serve"]\n');
    await syncInstructions(join(root, '.claude', 'CLAUDE.md'), CLAUDE_CODE_GUIDELINES);
    await syncInstructions(join(root, '.codex', 'AGENTS.md'), CODEX_GUIDELINES);
    const checks = await checkIntegrations(root);
    expect(checks.find((check) => check.id === 'claude-code hooks')).toMatchObject({ status: 'stale', detail: 'stale command path', fix: 'weft setup --harness claude-code' });
    expect(checks.find((check) => check.id === 'claude-code MCP')).toMatchObject({ status: 'stale', detail: 'stale command path' });
    expect(checks.find((check) => check.id === 'codex MCP')?.status).toBe('installed');
    expect(checks.find((check) => check.id === 'claude-code instructions')?.status).toBe('installed');
    expect(checks.find((check) => check.id === 'opencode instructions')).toMatchObject({ status: 'missing', fix: 'weft setup --harness opencode' });
  });
});
