/**
 * `wp_test` MCP tool.
 *
 * Routes test execution through the `vp` package-manager facade and returns a
 * summary-first payload with bounded `rawOutput`.
 */

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import * as testRunner from '#mcp/runners/test'
import { applyOutputTransform } from '#output-transforms/index'

import { resolveProjectRoot } from './_shared/project-root.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'

const inputSchema = z
  .object({
    cwd: z.string().optional(),
    packages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
  })
  .strict()

export type AkTestInput = z.infer<typeof inputSchema>

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    packages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
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
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input = inputSchema.parse(raw ?? {})
    // `input.cwd` is treated as the walk-start so the resolver still finds
    // the workspace root from any subdir. Callers wanting to bypass walking
    // should pass the repo root directly.
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    const result = await testRunner.runTests({
      cwd,
      packages: input.packages,
      files: input.files,
    })
    const { transform: _transform, ...compact } = applyOutputTransform(result.output, {
      toolName: 'wp_test',
    })
    const payload = {
      passed: result.passed,
      summary: result.passed
        ? `tests passed for ${summarizeScope(input)}`
        : `tests failed for ${summarizeScope(input)} (exit ${result.exitCode})`,
      exitCode: result.exitCode,
      details: {
        packages: input.packages,
        files: input.files,
      },
      ...compact,
    }
    return createSummaryResult(payload)
  },
}

export default tool
