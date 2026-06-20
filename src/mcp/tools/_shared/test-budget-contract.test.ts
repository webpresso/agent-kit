import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  MCP_SAFE_TEST_BUDGET_MS,
  refineTestBudgetContract,
  workspaceShardingInputSchema,
} from './test-budget-contract.js'

const schema = z
  .object({
    timeoutMs: z.number().int().positive().max(MCP_SAFE_TEST_BUDGET_MS).optional(),
    workspaceSharding: workspaceShardingInputSchema.optional(),
  })
  .superRefine(refineTestBudgetContract)

describe('test budget contract', () => {
  it('accepts a valid aligned timeout and total budget', () => {
    const result = schema.safeParse({
      timeoutMs: 5_000,
      workspaceSharding: { totalBudgetMs: 5_000, concurrency: 2 },
    })

    expect(result.success).toBe(true)
  })

  it('accepts the maximum explicit MCP test budget of five minutes', () => {
    const result = schema.safeParse({
      timeoutMs: 300_000,
      workspaceSharding: { totalBudgetMs: 300_000, concurrency: 4 },
    })

    expect(MCP_SAFE_TEST_BUDGET_MS).toBe(300_000)
    expect(result.success).toBe(true)
  })

  it('rejects invalid shard concurrency', () => {
    const result = schema.safeParse({
      workspaceSharding: { concurrency: 0 },
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['workspaceSharding', 'concurrency'])
  })

  it('rejects total budget above timeout', () => {
    const result = schema.safeParse({
      timeoutMs: 5_000,
      workspaceSharding: { totalBudgetMs: 6_000 },
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['workspaceSharding', 'totalBudgetMs'])
    expect(result.error?.issues[0]?.message).toMatch(/less than or equal to timeoutMs/)
  })

  it('rejects total budget above the MCP-safe maximum', () => {
    const result = schema.safeParse({
      workspaceSharding: { totalBudgetMs: MCP_SAFE_TEST_BUDGET_MS + 1 },
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['workspaceSharding', 'totalBudgetMs'])
  })
})
