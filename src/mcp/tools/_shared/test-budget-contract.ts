import { z } from "zod";

// Five minutes is the explicit upper bound for MCP-mediated test runs: long
// enough for a full workspace verification pass, but still finite so a stalled
// test transport returns control with structured diagnostics.
export const MCP_SAFE_TEST_BUDGET_MS = 300_000;

export const workspaceShardingInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    minFilesToShard: z.number().int().min(2).max(10_000).optional(),
    targetFilesPerShard: z.number().int().min(1).max(10_000).optional(),
    maxShards: z.number().int().min(2).max(128).optional(),
    concurrency: z.number().int().min(1).max(32).optional(),
    totalBudgetMs: z.number().int().min(1_000).max(MCP_SAFE_TEST_BUDGET_MS).optional(),
  })
  .strict();

interface TestBudgetLike {
  readonly timeoutMs?: number;
  readonly workspaceSharding?: {
    readonly totalBudgetMs?: number;
  };
}

export function refineTestBudgetContract(input: TestBudgetLike, ctx: z.RefinementCtx): void {
  const totalBudgetMs = input.workspaceSharding?.totalBudgetMs;
  if (
    input.timeoutMs !== undefined &&
    totalBudgetMs !== undefined &&
    totalBudgetMs > input.timeoutMs
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["workspaceSharding", "totalBudgetMs"],
      message: "workspaceSharding.totalBudgetMs must be less than or equal to timeoutMs",
    });
  }
}
