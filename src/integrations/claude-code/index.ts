import { join } from 'node:path';
import { syncInstructions } from '../instructions.js';

export const CLAUDE_CODE_GUIDELINES = '# Weft Core Guidelines\n- Use `ctx search <query>` to find relevant code.\n- Save session state with `ctx checkpoint <id>`.';

export function syncClaudeInstructions(repoRoot: string, managedContent = CLAUDE_CODE_GUIDELINES, dryRun = false) {
  return syncInstructions(join(repoRoot, 'CLAUDE.md'), managedContent, dryRun);
}

export async function runHookSafely<T>(hook: () => T | Promise<T>, timeoutMs = 450): Promise<T | undefined> {
  const timeout = Math.min(Math.max(timeoutMs, 1), 499);
  return Promise.race([Promise.resolve().then(hook), new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeout))]);
}
