import { join } from 'node:path';
import { syncInstructions } from '../instructions.js';

export const CODEX_GUIDELINES = '# Weft Core Guidelines\n- Run `weft search <query>` before broad repository searches.\n- Save session state with `weft checkpoint <id>`.';

export function syncCodexInstructions(repoRoot: string, managedContent = CODEX_GUIDELINES, dryRun = false) {
  return syncInstructions(join(repoRoot, 'AGENTS.md'), managedContent, dryRun);
}
