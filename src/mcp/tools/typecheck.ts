/**
 * `wp_typecheck` MCP tool.
 *
 * Runs `tsc --noEmit` either at cwd (no `packages` given) or once per
 * resolved package path (each becomes `tsc --noEmit -p <pkg>/tsconfig.json`).
 * Captures stdout (which is where `tsc` emits diagnostics) and parses
 * structured `{file, line, code, message}` entries from the standard
 * `<file>(<line>,<col>): error TS<code>: <message>` format. Returns the
 * aggregated payload `{passed, errorCount, errors, output}` wrapped in MCP
 * `text` content blocks.
 */

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { applyOutputTransform } from '#output-transforms/index'
import { runTypecheck } from '#typecheck/index.js'

import { resolveProjectRoot } from './_shared/project-root.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'

const inputSchema = z.object({
  cwd: z.string().optional(),
  packages: z.array(z.string()).optional(),
})

export type AkTypecheckInput = z.infer<typeof inputSchema>

const tscErrorSchema = z.object({
  file: z.string(),
  line: z.number(),
  code: z.string(),
  message: z.string(),
})

const outputSchema = createSummaryOutputSchema({
  counts: z.object({
    errorCount: z.number(),
  }),
  details: z.object({
    errors: z.array(tscErrorSchema),
  }),
})

export interface TscError {
  readonly file: string
  readonly line: number
  readonly code: string
  readonly message: string
}

function summarizeTypecheckResult(options: {
  passed: boolean
  errorCount: number
  timedOut: boolean
  aborted: boolean
}): string {
  if (options.timedOut) return 'typecheck timed out'
  if (options.aborted) return 'typecheck aborted'
  if (options.passed) return 'typecheck passed'
  return `typecheck failed with ${options.errorCount} error${options.errorCount === 1 ? '' : 's'}`
}

const tool: ToolDescriptor = {
  name: 'wp_typecheck',
  description:
    'Run `tsc --noEmit` per resolved package (or at cwd) and return structured diagnostics parsed from tsc stdout.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Typecheck',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw, extra) => {
    const input = inputSchema.parse(raw ?? {})
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    const result = await runTypecheck({
      cwd,
      packages: input.packages,
      signal: extra?.signal,
    })

    const { transform: _transform, ...compact } = applyOutputTransform(
      result.output,
      {
        toolName: 'wp_typecheck',
      },
    )
    const payload = {
      passed: result.passed,
      summary: summarizeTypecheckResult({
        passed: result.passed,
        errorCount: result.errorCount,
        timedOut: result.timedOut === true,
        aborted: result.aborted === true,
      }),
      counts: { errorCount: result.errorCount },
      details: { errors: result.errors },
      ...compact,
      timedOut: result.timedOut,
      aborted: result.aborted,
    }

    return createSummaryResult(payload)
  },
}

export default tool
