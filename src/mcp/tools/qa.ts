/**
 * `ak_qa` MCP tool.
 *
 * Composite tool that fans out to the three sibling check tools in parallel
 * via `Promise.all` and returns an aggregated structured payload:
 *
 *   {
 *     passed: lint.passed && typecheck.passed && test.passed,
 *     lint: <ak_lint payload>,
 *     typecheck: <ak_typecheck payload>,
 *     test: <ak_test payload>,
 *   }
 *
 * Implementation calls the sibling tools' `handler` exports through their
 * default descriptors — no public re-exports needed. Parallelism is the whole
 * point: a sequential composite would be strictly worse than the user just
 * running each tool back-to-back, since the sub-tools each spawn long-lived
 * external processes (`oxlint`, `tsc`, the test runner). Running them
 * concurrently is the only thing this composite buys you.
 */

import { z } from 'zod'

import type { ToolDescriptor, ToolHandlerResult } from '#mcp/auto-discover'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import lintTool from './lint.js'
import testTool from './test.js'
import typecheckTool from './typecheck.js'

const inputSchema = z.object({
  // Forwarded to all three sub-tools so cross-repo invocation works (e.g.
  // run agent-kit's QA from a session launched in monorepo).
  cwd: z.string().optional(),
  // Forwarded to `ak_lint.files` and `ak_test.files` so a scoped QA on
  // changed files is possible. `ak_typecheck` ignores files (it operates on
  // tsconfig projects).
  files: z.array(z.string()).optional(),
  // Forwarded to `ak_typecheck.packages` and `ak_test.packages` to scope
  // the run to specific workspace packages.
  packages: z.array(z.string()).optional(),
})

export type AkQaInput = z.infer<typeof inputSchema>

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    lint: z.record(z.string(), z.unknown()),
    typecheck: z.record(z.string(), z.unknown()),
    test: z.record(z.string(), z.unknown()),
  }),
})

interface SubResultShape {
  readonly passed?: boolean
  readonly [key: string]: unknown
}

/**
 * Sub-tool handlers return MCP `{content: [{type: 'text', text: <json>}]}`.
 * To aggregate into a single structured payload we re-parse the JSON.
 *
 * On any unwrap failure (non-text block, non-object payload, JSON parse error)
 * the step is marked `passed: false` AND annotated with a concrete
 * `unwrapError` string so the caller can distinguish "lint genuinely failed
 * with empty issues" from "we couldn't read lint's response" — the previous
 * silent collapse hid composition bugs as fake lint failures.
 */
function unwrap(result: ToolHandlerResult): SubResultShape {
  const structured = (result as ToolHandlerResult & { structuredContent?: unknown })
    .structuredContent
  if (structured && typeof structured === 'object') {
    return structured as SubResultShape
  }
  const block = result.content[0]
  if (!block || block.type !== 'text' || typeof block.text !== 'string') {
    return {
      passed: false,
      unwrapError: 'sub-tool did not return a text content block',
      raw: result,
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(block.text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { passed: false, unwrapError: `JSON.parse failed: ${reason}`, raw: block.text }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { passed: false, unwrapError: 'sub-tool payload was not an object', raw: block.text }
  }
  return parsed as SubResultShape
}

function summarizeQa(
  lint: SubResultShape,
  typecheck: SubResultShape,
  test: SubResultShape,
): string {
  const failed: string[] = []
  if (lint.passed !== true) failed.push('lint')
  if (typecheck.passed !== true) failed.push('typecheck')
  if (test.passed !== true) failed.push('test')
  return failed.length === 0 ? 'qa passed' : `qa failed: ${failed.join(', ')}`
}

const tool: ToolDescriptor = {
  name: 'ak_qa',
  description:
    'Run `ak_lint`, `ak_typecheck`, and `ak_test` in parallel via `Promise.all`. Returns `{passed, lint, typecheck, test}` where the top-level `passed` is the AND of the three sub-results.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'QA (lint + typecheck + test)',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw, extra): Promise<ToolHandlerResult> => {
    const input = inputSchema.parse(raw ?? {})

    const [lintResult, typecheckResult, testResult] = await Promise.all([
      lintTool.handler({ cwd: input.cwd, files: input.files }, extra),
      typecheckTool.handler({ cwd: input.cwd, packages: input.packages }, extra),
      testTool.handler({ cwd: input.cwd, files: input.files, packages: input.packages }, extra),
    ])

    const lint = unwrap(lintResult)
    const typecheck = unwrap(typecheckResult)
    const test = unwrap(testResult)

    const passed = lint.passed === true && typecheck.passed === true && test.passed === true
    // `isError: true` only fires when we couldn't even READ a sub-tool's
    // result (composition bug). A sub-tool legitimately reporting
    // `passed: false` is normal output the agent can act on.
    const composeError =
      typeof lint.unwrapError === 'string' ||
      typeof typecheck.unwrapError === 'string' ||
      typeof test.unwrapError === 'string'

    const payload = {
      passed,
      summary: summarizeQa(lint, typecheck, test),
      details: { lint, typecheck, test },
    }
    return createSummaryResult(payload, composeError ? { isError: true } : {})
  },
}

export default tool
