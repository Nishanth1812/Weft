import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('onboard command', () => {
  it('registers and indexes a repository and installs MCP config without touching the real home', async () => {
    const home = await mkdtemp(join(tmpdir(), 'weft-onboard-home-'));
    const project = await mkdtemp(join(tmpdir(), 'weft-onboard-repo-'));
    dirs.push(home, project);
    const previousCwd = process.cwd();
    const previousEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA };
    try {
      process.env.HOME = home; process.env.USERPROFILE = home;
      process.env.APPDATA = join(home, 'roaming'); process.env.LOCALAPPDATA = join(home, 'local');
      process.chdir(project);
      execFileSync('git', ['init', '-q'], { cwd: project });
      await writeFile(join(project, 'source.ts'), 'export const useful = true;\n');
      vi.resetModules();
      const { runCli } = await import('../../../src/cli/index.js');
      const output: string[] = [];
      const code = await runCli(['onboard', project, '--harness', 'opencode', '--json'], { stdout: (text) => output.push(text), stderr: vi.fn() });
      expect(code, output.join('')).toBe(0);
      const response = JSON.parse(output.join('')) as { data: { indexed: { chunks: number }; installed: Array<{ path: string }> } };
      expect(response.data.indexed.chunks).toBeGreaterThan(0);
      const config = JSON.parse(await readFile(join(project, 'opencode.json'), 'utf8'));
      expect(config.mcp.weft.command).toEqual(['weft', 'mcp', 'serve']);
      expect(response.data.installed[0]!.path).toBe(join(project, 'opencode.json'));
      const preview: string[] = [];
      expect(await runCli(['mcp', 'install', '--harness', 'claude-code', '--dry-run', '--json'], { stdout: (text) => preview.push(text), stderr: vi.fn() })).toBe(0);
      await expect(readFile(join(project, '.mcp.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      const doctor: string[] = [];
      expect(await runCli(['doctor', '--json'], { stdout: (text) => doctor.push(text), stderr: vi.fn() })).toBe(0);
      expect(JSON.parse(doctor.join('')).data).toHaveProperty('weftOnPath', expect.any(Boolean));
    } finally {
      process.chdir(previousCwd);
      for (const [key, value] of Object.entries(previousEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
    }
  });
});
