import { z } from "zod";
export declare const MCP_SAFE_TEST_BUDGET_MS = 300000;
export declare const workspaceShardingInputSchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    minFilesToShard: z.ZodOptional<z.ZodNumber>;
    targetFilesPerShard: z.ZodOptional<z.ZodNumber>;
    maxShards: z.ZodOptional<z.ZodNumber>;
    concurrency: z.ZodOptional<z.ZodNumber>;
    totalBudgetMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
interface TestBudgetLike {
    readonly timeoutMs?: number;
    readonly workspaceSharding?: {
        readonly totalBudgetMs?: number;
    };
}
export declare function refineTestBudgetContract(input: TestBudgetLike, ctx: z.RefinementCtx): void;
export {};
//# sourceMappingURL=test-budget-contract.d.ts.map