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
import lintTool from './lint.js'
import testTool from './test.js'
import typecheckTool from './typecheck.js'

const inputSchema = z.object({})

export type AkQaInput = z.infer<typeof inputSchema>

interface SubResultShape {
  readonly passed?: boolean
  readonly [key: string]: unknown
}

/**
 * Sub-tool handlers return MCP `{content: [{type: 'text', text: <json>}]}`.
 * To aggregate into a single structured payload we need to reach back through
 * that envelope and re-parse the JSON. If a sub-tool ever returns a non-text
 * block or invalid JSON we treat the step as failed (`passed: false`) rather
 * than crashing the composite — `ak_qa` is meant to be a robust health check.
 */
function unwrap(result: ToolHandlerResult): SubResultShape {
  const block = result.content[0]
  if (!block || block.type !== 'text' || typeof block.text !== 'string') {
    return { passed: false, raw: result }
  }
  try {
    const parsed = JSON.parse(block.text) as unknown
    if (parsed && typeof parsed === 'object') return parsed as SubResultShape
    return { passed: false, raw: block.text }
  } catch {
    return { passed: false, raw: block.text }
  }
}

const tool: ToolDescriptor = {
  name: 'ak_qa',
  description:
    'Run `ak_lint`, `ak_typecheck`, and `ak_test` in parallel via `Promise.all`. Returns `{passed, lint, typecheck, test}` where the top-level `passed` is the AND of the three sub-results.',
  inputSchema,
  handler: async (raw): Promise<ToolHandlerResult> => {
    inputSchema.parse(raw ?? {})

    const [lintResult, typecheckResult, testResult] = await Promise.all([
      lintTool.handler({}),
      typecheckTool.handler({}),
      testTool.handler({}),
    ])

    const lint = unwrap(lintResult)
    const typecheck = unwrap(typecheckResult)
    const test = unwrap(testResult)

    const passed = lint.passed === true && typecheck.passed === true && test.passed === true

    const payload = { passed, lint, typecheck, test }
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
  },
}

export default tool
