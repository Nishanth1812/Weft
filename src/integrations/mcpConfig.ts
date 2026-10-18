import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

export type Harness = 'claude-code' | 'codex' | 'opencode' | 't3';
const command = { command: 'weft', args: ['mcp', 'serve'] };

export function harnessConfigPath(harness: Harness, home: string, project?: string): string {
  if (harness === 'claude-code') return project ? join(project, '.mcp.json') : join(home, '.claude', 'settings.json');
  if (harness === 'codex') return join(project ?? home, project ? '.codex' : '.codex', 'config.toml');
  if (harness === 'opencode') return join(project ?? home, 'opencode.json');
  return join(project ?? home, project ? '.t3' : '.t3', 'mcp.json');
}

export async function installMcpConfig(harness: Harness, options: { home: string; project?: string; dryRun?: boolean }): Promise<{ path: string; modified: boolean }> {
  const path = harnessConfigPath(harness, options.home, options.project);
  let original = '';
  try { original = await readFile(path, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let content: string;
  if (harness === 'codex') {
    const entry = '[mcp_servers.weft]\ncommand = "weft"\nargs = ["mcp", "serve"]';
    const pattern = /\[mcp_servers\.weft\][\s\S]*?(?=\n\[|$)/;
    content = pattern.test(original) ? original.replace(pattern, entry) : `${original}${original && !original.endsWith('\n') ? '\n' : ''}${entry}\n`;
  } else {
    let config: Record<string, unknown>;
    try { config = original ? JSON.parse(original) as Record<string, unknown> : {}; } catch { throw new Error(`Invalid JSON harness config: ${path}`); }
    const key = harness === 'claude-code' ? 'mcpServers' : 'mcp';
    const entries = config[key] && typeof config[key] === 'object' ? config[key] as Record<string, unknown> : {};
    config[key] = { ...entries, weft: harness === 'opencode' ? { type: 'local', command: ['weft', 'mcp', 'serve'], enabled: true } : command };
    content = `${JSON.stringify(config, null, 2)}\n`;
  }
  const modified = original !== content;
  if (modified && !options.dryRun) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    try { await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, path); }
    finally { await rm(temporary, { force: true }); }
  }
  return { path, modified };
}
