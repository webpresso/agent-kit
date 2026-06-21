/**
 * `wp_test` MCP tool.
 *
 * Routes test execution through the `vp` package-manager facade and returns a
 * summary-first payload with bounded `rawOutput`.
 */

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import * as testRunner from '#mcp/runners/test'
import { TEST_SUITE_VALUES, normalizeTestSuiteName } from '#test'

import { resolveProjectRoot } from './_shared/project-root.js'
import { formatMcpToolOutput } from './_shared/full-output.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import {
  MCP_SAFE_TEST_BUDGET_MS,
  refineTestBudgetContract,
  workspaceShardingInputSchema,
} from './_shared/test-budget-contract.js'

const inputSchema = z
  .object({
    cwd: z.string().optional(),
    suite: z.enum(TEST_SUITE_VALUES).optional(),
    packages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    timeoutMs: z.number().int().positive().max(MCP_SAFE_TEST_BUDGET_MS).optional(),
    workspaceSharding: workspaceShardingInputSchema.optional(),
    full: z.boolean().optional().default(false),
  })
  .superRefine(refineTestBudgetContract)
  .strict()

export type AkTestInput = z.infer<typeof inputSchema>

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    suite: z.enum(TEST_SUITE_VALUES).optional(),
    packages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    workspaceSharding: z
      .object({
        enabled: z.boolean().optional(),
        minFilesToShard: z.number().optional(),
        targetFilesPerShard: z.number().optional(),
        maxShards: z.number().optional(),
        concurrency: z.number().optional(),
        totalBudgetMs: z.number().optional(),
      })
      .optional(),
    failureScope: z.string().optional(),
    timeoutMs: z.number().optional(),
  }),
})

function summarizeScope(input: AkTestInput): string {
  if (input.packages && input.packages.length > 0) {
    return `${input.packages.length} package${input.packages.length === 1 ? '' : 's'}`
  }
  if (input.files && input.files.length > 0) {
    return `${input.files.length} file${input.files.length === 1 ? '' : 's'}`
  }
  return 'workspace'
}

function summarizeOutcome(input: AkTestInput, result: testRunner.TestResult): string {
  const scope = summarizeScope(input)
  const scopeSuffix = result.failureScope ? ` (${result.failureScope})` : ''
  if (result.timedOut) return `tests timed out for ${scope}${scopeSuffix}`
  if (result.aborted) return `tests aborted for ${scope}${scopeSuffix}`
  return result.passed
    ? `tests passed for ${scope}`
    : `tests failed for ${scope}${scopeSuffix} (exit ${result.exitCode})`
}

const tool: ToolDescriptor = {
  name: 'wp_test',
  description:
    'Run tests via the `vp` package-manager facade. Use `wp_e2e` for suite-aware E2E execution.',
  inputSchema,
  outputSchema,
  // Tests SHOULD be deterministic + side-effect-free, but we can't prove it
  // for arbitrary user code, so leave `idempotentHint` unset (defaults false)
  // and set `readOnlyHint: false`. Tests can mutate dev DBs, write fixtures,
  // etc. — clients should treat invocation as observable side effects.
  annotations: {
    title: 'Test',
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (raw, extra) => {
    const input = inputSchema.parse(raw ?? {})
    // `input.cwd` is treated as the walk-start so the resolver still finds
    // the workspace root from any subdir. Callers wanting to bypass walking
    // should pass the repo root directly.
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    const result = await testRunner.runTests({
      cwd,
      suite: input.suite,
      packages: input.packages,
      files: input.files,
      signal: extra?.signal,
      timeoutMs: input.timeoutMs,
      workspaceSharding: input.workspaceSharding,
    })
    const compact = formatMcpToolOutput(result.output, {
      toolName: 'wp_test',
      full: input.full,
      cwd,
    })
    const payload = {
      passed: result.passed,
      summary: summarizeOutcome(input, result),
      exitCode: result.exitCode,
      details: {
        suite: normalizeTestSuiteName(input.suite),
        packages: input.packages,
        files: input.files,
        workspaceSharding: input.workspaceSharding,
        failureScope: result.failureScope,
        timeoutMs: input.timeoutMs,
      },
      ...compact,
      timedOut: result.timedOut || undefined,
      aborted: result.aborted || undefined,
      ...(result.timedOut ? { failures: [{ message: 'test command timed out' }] } : {}),
      ...(result.aborted ? { failures: [{ message: 'aborted by client signal' }] } : {}),
    }
    return createSummaryResult(payload, result.timedOut || result.aborted ? { isError: true } : {})
  },
}

export default tool
