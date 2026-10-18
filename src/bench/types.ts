export type TrialCondition = 'A' | 'B' | 'C';

export const TRIAL_CONDITIONS: Readonly<Record<TrialCondition, string>> = {
  A: 'Baseline harness',
  B: 'Shared instructions',
  C: 'Full Weft with index, retrieval, and checkpoints',
};

export interface TaskDefinition {
  id: string;
  title: string;
  category: 'bugfix' | 'refactor' | 'feature';
  repoPath: string;
  testCommand: string;
}

export interface TrialExecution {
  success: boolean;
  durationMs: number;
  tokensUsed: number;
  costMicros: number;
  error?: string;
}

export type BenchmarkTask = TaskDefinition & {
  run: (condition: TrialCondition) => Promise<TrialExecution>;
};

export interface TrialResult extends TrialExecution {
  taskId: string;
  condition: TrialCondition;
}

export interface BenchmarkSummary {
  totalTasks: number;
  conditionResults: Record<TrialCondition, {
    passRate: number;
    avgDurationMs: number;
    totalCostMicros: number;
    efficiencyScore: number;
  }>;
}

export interface BenchmarkReport extends BenchmarkSummary {
  results: TrialResult[];
}
