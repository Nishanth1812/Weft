import { hookStateDir, logHookFailure, prefetchGitState, runCheckpointHook, runSessionStartHook } from '../hooks/claude.js';
import { runHookSafely } from '../integrations/claude-code/index.js';
import { ensureRepoOnboarded } from '../onboarding/auto.js';

// Kept apart from the command router so a hook only loads the modules it needs (every session start and stop pays this).
export async function runHookCommand(event: string | undefined): Promise<{ code: number; data?: string }> {
  try {
    if (event !== 'session-start' && event !== 'stop' && event !== 'pre-compact') { await logHookFailure(hookStateDir(), new Error(`Unknown hook event: ${event ?? ''}`)); return { code: 0 }; }
    prefetchGitState(process.cwd());
    const data = await runHookSafely(async () => {
      if (event === 'session-start') { await ensureRepoOnboarded(process.cwd()); return runSessionStartHook({ stateDir: hookStateDir() }); }
      await runCheckpointHook({ stateDir: hookStateDir() });
      return '';
    }, 400);
    if (data === undefined) await logHookFailure(hookStateDir(), new Error('Hook timed out'));
    return { code: 0, data: data || undefined };
  } catch (error) { await logHookFailure(hookStateDir(), error); return { code: 0 }; }
}
