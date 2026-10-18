import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { formatContext } from '../../src/cli/format.js';
import { rankCandidates } from '../../src/context/ranker.js';
import { packContext } from '../../src/context/packer.js';
import { searchChunks } from '../../src/context/search.js';
import { estimateTokens } from '../../src/core/estimate/tokenEstimator.js';
import { indexRepository } from '../../src/indexer/indexer.js';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrator.js';

type GoldenQuery = { query: string; expectedTop3: string[] };
const queries = JSON.parse(await readFile(new URL('./queries.json', import.meta.url), 'utf8')) as GoldenQuery[];

describe('golden retrieval', () => {
  it('meets top-1 and top-3 accuracy gates and measures compact context size', async () => {
    const db = openDatabase(':memory:');
    try {
      migrate(db);
      db.prepare('INSERT INTO repositories (id, root_path, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('golden', process.cwd(), 'golden', 'now', 'now');
      await indexRepository(db, 'golden', process.cwd(), { force: true });
      db.prepare("DELETE FROM files WHERE repo_id = 'golden' AND path = 'tests/golden/queries.json'").run();
      let top1 = 0;
      let top3 = 0;
      const beforeTokens: number[] = [];
      const afterTokens: number[] = [];
      for (const entry of queries) {
        const ranked = rankCandidates(searchChunks(db, 'golden', entry.query, 100), entry.query);
        const files = ranked.filter((item, index) => ranked.findIndex(other => other.path === item.path) === index);
        if (entry.expectedTop3.includes(files[0]?.path ?? '')) top1++;
        if (files.slice(0, 3).some(item => entry.expectedTop3.includes(item.path))) top3++;
        const baseline = packContext(ranked, 2048, entry.query);
        const compact = packContext(files.slice(0, 2), 1500, entry.query);
        beforeTokens.push(estimateTokens(JSON.stringify(baseline)));
        afterTokens.push(estimateTokens(formatContext(compact.items)));
      }
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
      const top1Rate = top1 / queries.length;
      const top3Rate = top3 / queries.length;
      console.info(`Golden retrieval: top-1 ${(top1Rate * 100).toFixed(1)}%, top-3 ${(top3Rate * 100).toFixed(1)}%; context median tokens JSON ${median(beforeTokens)}, compact ${median(afterTokens)}`);
      expect(top1Rate).toBeGreaterThanOrEqual(0.70);
      expect(top3Rate).toBeGreaterThanOrEqual(0.90);
    } finally { db.close(); }
  }, 120_000);
});
