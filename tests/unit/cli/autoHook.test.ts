import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { onboard } = vi.hoisted(() => ({ onboard: vi.fn(async () => ({ onboarded: false })) }));
vi.mock('../../../src/onboarding/auto.js', async (load) => ({ ...(await load<typeof import('../../../src/onboarding/auto.js')>()), ensureRepoOnboarded: onboard }));

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))); onboard.mockClear(); });

describe('session start auto-onboarding', () => {
  it('calls onboarding with the current workspace before running the hook', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'weft-hook-cwd-')), state = await mkdtemp(join(tmpdir(), 'weft-hook-state-'));
    dirs.push(cwd, state);
    const previousCwd = process.cwd(), previousState = process.env.WEFT_STATE_DIR;
    try {
      process.chdir(cwd); process.env.WEFT_STATE_DIR = state;
      const { runCommand } = await import('../../../src/cli/commands/index.js');
      await runCommand(['hook', 'session-start']);
      expect(onboard).toHaveBeenCalledWith(cwd);
    } finally {
      process.chdir(previousCwd);
      if (previousState === undefined) delete process.env.WEFT_STATE_DIR; else process.env.WEFT_STATE_DIR = previousState;
    }
  });
});
