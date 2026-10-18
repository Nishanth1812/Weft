import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runLiveSuite } from '../../../src/bench/live.js';

describe('live benchmark adapter', () => {
  it('runs a stub harness in isolated A/B/C repo copies and reads provider usage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'weft-bench-test-'));
    try {
      const repo = join(root, 'repo'); await mkdir(repo);
      const stub = join(root, 'stub.mjs');
      await writeFile(stub, "import { writeFile } from 'node:fs/promises'; const prompt=process.argv[2]; await writeFile('result.txt', prompt); console.log(JSON.stringify({usage:{total_tokens:12,cost_usd:0.0003}}));\n");
      const task = { id: 'stub', title: 'Stub task', category: 'feature' as const, repoPath: repo, prompt: 'condition {condition}', testCommand: 'node -e "require(\'node:fs\').accessSync(\'result.txt\')"' };
      const report = await runLiveSuite([task], `node "${stub}" {prompt}`);
      expect(report.results).toHaveLength(3);
      expect(report.results.every((result) => result.success && result.tokensUsed === 12 && result.costMicros === 300 && result.tokenProvenance === 'provider_reported' && result.costProvenance === 'provider_reported')).toBe(true);
      expect(await readFile(join(repo, 'result.txt')).catch(() => '')).toBe('');
      expect(report.conditionResults.A.successfulTaskCostMicros).toBe(300);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
