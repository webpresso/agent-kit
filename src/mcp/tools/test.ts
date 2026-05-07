/**
 * `ak_test` MCP tool.
 *
 * Routes test execution to either `just` (when a `justfile` is present in cwd)
 * or `pnpm` (when only `pnpm-workspace.yaml` is present), with an explicit
 * `backend` override. Returns a summary-first payload with bounded `rawOutput`.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import * as justBackend from '#mcp/backends/just'
import * as pnpmBackend from '#mcp/backends/pnpm'
import { applyOutputTransform } from '#output-transforms/index'

import { resolveProjectRoot } from './_shared/project-root.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'

const inputSchema = z
  .object({
    cwd: z.string().optional(),
    packages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    backend: z.enum(['just', 'pnpm', 'auto']).optional().default('auto'),
  })
  .strict()

export type AkTestInput = z.infer<typeof inputSchema>

const outputSchema = createSummaryOutputSchema({
  backend: z.enum(['just', 'pnpm']),
  details: z.object({
    packages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
  }),
})

function detectBackend(cwd: string, override: AkTestInput['backend']): 'just' | 'pnpm' {
  if (override === 'just' || override === 'pnpm') return override
  if (existsSync(join(cwd, 'justfile'))) return 'just'
  return 'pnpm'
}

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
  name: 'ak_test',
  description:
    'Run tests via the project test backend. Auto-detects `just` (when a justfile is present) or `pnpm` (workspace fallback); supports an explicit override via `backend`. Use `ak_e2e` for suite-aware E2E execution.',
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
    // the workspace root from any subdir (e.g. `cwd: '<repo>/src/cli'`
    // resolves to `<repo>` if it has pnpm-workspace.yaml). Callers wanting
    // to bypass walking should pass the repo root directly.
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    const backend = detectBackend(cwd, input.backend)
    const runner = backend === 'just' ? justBackend : pnpmBackend
    const result = await runner.runTests({
      cwd,
      packages: input.packages,
      files: input.files,
    })
    const { transform: _transform, ...compact } = applyOutputTransform(result.output, {
      toolName: 'ak_test',
    })
    const payload = {
      passed: result.passed,
      summary: result.passed
        ? `tests passed via ${backend} for ${summarizeScope(input)}`
        : `tests failed via ${backend} for ${summarizeScope(input)} (exit ${result.exitCode})`,
      exitCode: result.exitCode,
      backend,
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
