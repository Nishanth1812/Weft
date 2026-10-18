import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../../src/cli/index.js';

describe('CLI', () => {
  it('returns the standardized invalid-arguments exit code and JSON envelope', async () => {
    const output: string[] = [];
    const exitCode = await runCli(['not-a-command', '--json'], { stdout: (text) => output.push(text), stderr: vi.fn() });
    expect(exitCode).toBe(2);
    expect(JSON.parse(output.join(''))).toMatchObject({
      schema_version: 1, command: 'not-a-command', ok: false, status: 'invalid_arguments',
      data: null, warnings: [], errors: expect.any(Array),
    });
  });

  it('dispatches help and reports the available command families', async () => {
    const output: string[] = [];
    const exitCode = await runCli(['--help'], { stdout: (text) => output.push(text), stderr: vi.fn() });
    expect(exitCode).toBe(0);
    expect(output.join('')).toContain('migrate devpulse');
    expect(output.join('')).toContain('repos');
  });

  it('rejects unknown options with the invalid-arguments exit code', async () => {
    const output: string[] = [];
    const exitCode = await runCli(['repos', 'list', '--not-real', '--json'], { stdout: (text) => output.push(text), stderr: vi.fn() });
    expect(exitCode).toBe(2);
    expect(JSON.parse(output.join(''))).toMatchObject({ status: 'invalid_arguments', errors: ['Unknown option: --not-real'] });
  });

  it('labels the versioned JSON envelope with the version command', async () => {
    const output: string[] = [];
    expect(await runCli(['--version', '--json'], { stdout: (text) => output.push(text), stderr: vi.fn() })).toBe(0);
    expect(JSON.parse(output.join(''))).toMatchObject({ command: 'version', data: { version: '0.1.0' } });
  });
});
