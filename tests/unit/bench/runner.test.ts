import { describe, expect, it } from 'vitest';
import { runBenchmark } from '../../../src/bench/runner.js';
import type { BenchmarkTask } from '../../../src/bench/types.js';

const tasks: BenchmarkTask[] = [
  {
    id: 'fix-1',
    title: 'Fix a bug',
    category: 'bugfix',
    repoPath: '/repo',
    testCommand: 'npm test',
    run: async (condition) => ({
      success: condition !== 'A',
      durationMs: 3_600_000,
      tokensUsed: condition === 'A' ? 100 : 80,
      costMicros: condition === 'A' ? 2_000_000 : 1_000_000,
    }),
  },
  {
    id: 'refactor-1',
    title: 'Refactor a module',
    category: 'refactor',
    repoPath: '/repo',
    testCommand: 'npm test',
    run: async () => ({ success: false, durationMs: 0, tokensUsed: 0, costMicros: 0 }),
  },
];

describe('runBenchmark', () => {
  it('runs each requested condition for every task and returns stable trial results', async () => {
    const report = await runBenchmark(tasks, ['A', 'C']);

    expect(report.results).toEqual([
      { taskId: 'fix-1', condition: 'A', success: false, durationMs: 3_600_000, tokensUsed: 100, costMicros: 2_000_000 },
      { taskId: 'fix-1', condition: 'C', success: true, durationMs: 3_600_000, tokensUsed: 80, costMicros: 1_000_000 },
      { taskId: 'refactor-1', condition: 'A', success: false, durationMs: 0, tokensUsed: 0, costMicros: 0 },
      { taskId: 'refactor-1', condition: 'C', success: false, durationMs: 0, tokensUsed: 0, costMicros: 0 },
    ]);
    expect(report.totalTasks).toBe(2);
    expect(report.conditionResults.A).toEqual({ passRate: 0, avgDurationMs: 1_800_000, totalCostMicros: 2_000_000, efficiencyScore: 0, successfulTaskCostMicros: 0, successfulTaskCostVarianceMicros: 0, successfulTaskCostCi95Micros: [0, 0] });
    expect(report.conditionResults.B).toEqual({ passRate: 0, avgDurationMs: 0, totalCostMicros: 0, efficiencyScore: 0, successfulTaskCostMicros: 0, successfulTaskCostVarianceMicros: 0, successfulTaskCostCi95Micros: [0, 0] });
    expect(report.conditionResults.C).toEqual({ passRate: 0.5, avgDurationMs: 1_800_000, totalCostMicros: 1_000_000, efficiencyScore: 0.5, successfulTaskCostMicros: 1_000_000, successfulTaskCostVarianceMicros: 0, successfulTaskCostCi95Micros: [1_000_000, 1_000_000] });
  });

  it('records rejected task executions as failed trials and keeps comparing conditions', async () => {
    const report = await runBenchmark([{
      ...tasks[0]!,
      run: async (condition) => {
        if (condition === 'A') throw new Error('test command failed');
        return { success: true, durationMs: 1_000, tokensUsed: 10, costMicros: 20 };
      },
    }], ['A', 'B']);

    expect(report.results[0]).toMatchObject({ success: false, error: 'test command failed' });
    expect(report.results[1]).toMatchObject({ condition: 'B', success: true });
  });

  it('reports variance across successful task costs', async () => {
    const report = await runBenchmark([1, 3].map((cost, index) => ({ ...tasks[0]!, id: `success-${index}`, run: async () => ({ success: true, durationMs: 0, tokensUsed: 1, costMicros: cost }) })), ['A']);
    expect(report.conditionResults.A.successfulTaskCostMicros).toBe(2);
    expect(report.conditionResults.A.successfulTaskCostVarianceMicros).toBe(1);
  });
});
