import { join } from 'node:path';
import { syncInstructions } from '../instructions.js';

export const CLAUDE_CODE_GUIDELINES = '# Weft Core Guidelines\n- Use `ctx search <query>` to find relevant code.\n- Save session state with `ctx checkpoint <id>`.';

export function syncClaudeInstructions(repoRoot: string, managedContent = CLAUDE_CODE_GUIDELINES, dryRun = false) {
  return syncInstructions(join(repoRoot, 'CLAUDE.md'), managedContent, dryRun);
}

export async function runHookSafely<T>(hook: () => T | Promise<T>, timeoutMs = 450): Promise<T | undefined> {
  const timeout = Math.min(Math.max(timeoutMs, 1), 499);
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeout); });
  // Clear the timer: a live one keeps the hook process running until it fires even after the work is done.
  return Promise.race([Promise.resolve().then(hook), expired]).finally(() => clearTimeout(timer));
}

export { hookSettingsRoot, hookStateDir, installClaudeHooks, runCheckpointHook, runSessionStartHook, uninstallClaudeHooks } from '../../hooks/claude.js';
