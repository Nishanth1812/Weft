import { hookStateDir, logHookFailure, prefetchGitState, runCheckpointHook, runSessionStartHook } from '../hooks/claude.js';
import { runHookSafely } from '../integrations/claude-code/index.js';
import { ensureRepoOnboarded } from '../onboarding/auto.js';

async function readHookInput(timeoutMs = 150): Promise<{ cwd?: string; prompt?: string }> {
  if (process.stdin.isTTY) return {};
  return new Promise((done) => {
    let raw = '';
    const finish = () => { try { const parsed = JSON.parse(raw) as { cwd?: unknown; prompt?: unknown }; done({ cwd: typeof parsed.cwd === 'string' ? parsed.cwd : undefined, prompt: typeof parsed.prompt === 'string' ? parsed.prompt : undefined }); } catch { done({}); } };
    const timer = setTimeout(() => { process.stdin.pause(); finish(); }, timeoutMs);
    process.stdin.setEncoding('utf8').on('data', (chunk: string) => { raw += chunk; }).once('end', () => { clearTimeout(timer); finish(); });
  });
}

// Kept apart from the command router so a hook only loads the modules it needs (every session start and stop pays this).
export async function runHookCommand(event: string | undefined): Promise<{ code: number; data?: string }> {
  try {
    if (event !== 'session-start' && event !== 'user-prompt-submit' && event !== 'stop' && event !== 'pre-compact') { await logHookFailure(hookStateDir(), new Error(`Unknown hook event: ${event ?? ''}`)); return { code: 0 }; }
    // Claude Code sends the event payload as JSON on stdin; only the prompt hook needs it.
    const input = event === 'user-prompt-submit' ? await readHookInput() : {};
    if (event !== 'user-prompt-submit') prefetchGitState(process.cwd());
    const data = await runHookSafely(async () => {
      if (event === 'user-prompt-submit') return (await import('../hooks/prompt.js')).runPromptHook({ stateDir: hookStateDir(), cwd: input.cwd, prompt: input.prompt ?? '' });
      if (event === 'session-start') { const onboarded = await ensureRepoOnboarded(process.cwd());
        if (onboarded.reason === 'not-git') return (await import('../onboarding/workspace.js')).workspaceHint(process.cwd(), hookStateDir());
        return runSessionStartHook({ stateDir: hookStateDir() });
      }
      await runCheckpointHook({ stateDir: hookStateDir() });
      return '';
    }, 400);
    if (data === undefined) await logHookFailure(hookStateDir(), new Error('Hook timed out'));
    return { code: 0, data: data || undefined };
  } catch (error) { await logHookFailure(hookStateDir(), error); return { code: 0 }; }
}
