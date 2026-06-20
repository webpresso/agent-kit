import { z } from 'zod'

export const MCP_SAFE_TEST_BUDGET_MS = 300_000

export const workspaceShardingInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    minFilesToShard: z.number().int().min(2).max(10_000).optional(),
    targetFilesPerShard: z.number().int().min(1).max(10_000).optional(),
    maxShards: z.number().int().min(2).max(128).optional(),
    concurrency: z.number().int().min(1).max(32).optional(),
    totalBudgetMs: z.number().int().min(1_000).max(MCP_SAFE_TEST_BUDGET_MS).optional(),
  })
  .strict()

interface TestBudgetLike {
  readonly timeoutMs?: number
  readonly workspaceSharding?: {
    readonly totalBudgetMs?: number
  }
}

export function refineTestBudgetContract(input: TestBudgetLike, ctx: z.RefinementCtx): void {
  const totalBudgetMs = input.workspaceSharding?.totalBudgetMs
  if (
    input.timeoutMs !== undefined &&
    totalBudgetMs !== undefined &&
    totalBudgetMs > input.timeoutMs
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['workspaceSharding', 'totalBudgetMs'],
      message: 'workspaceSharding.totalBudgetMs must be less than or equal to timeoutMs',
    })
  }
}
