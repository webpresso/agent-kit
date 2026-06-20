/**
 * `wp_audits` MCP tool.
 *
 * Batch wrapper around the existing `wp_audit` dispatcher. It is intentionally
 * read-only and deterministic: every resolved audit is attempted in order,
 * individual crashes are captured as failed result entries, and aggregate
 * `passed` is true only when every audit passes.
 */

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { MCP_AUDIT_KINDS, type MCPAuditKind } from './_shared/audit-kinds.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { dispatchAudit, KINDS } from './audit.js'
import type { AuditPayload } from './audit.js'

const GUARDRAIL_PRESET = [
  'catalog-drift',
  'package-surface',
  'reference-parity-matrix',
  'blueprint-readme-drift',
  'blueprint-lifecycle',
  'docs-frontmatter',
  'agents',
  'architecture-drift',
  'absolute-path-policy',
  'no-first-party-mjs',
  'toolchain-isolation',
  'open-source-licenses',
  'secrets-policy',
  'no-dev-vars',
  'secret-provider-quarantine',
  'secrets-config',
] as const satisfies readonly MCPAuditKind[]

const ALL_PRESET = MCP_AUDIT_KINDS.filter(
  (kind) => kind !== 'commit-message' && kind !== 'bundle-budget',
) as MCPAuditKind[]

const inputSchema = z
  .object({
    cwd: z.string().optional(),
    directory: z.string().optional(),
    kinds: z.array(z.enum(KINDS)).min(1).optional(),
    preset: z.enum(['all', 'guardrails']).optional(),
    baseRef: z.string().optional(),
    strict: z.boolean().optional(),
  })
  .refine((input) => Boolean(input.kinds) !== Boolean(input.preset), {
    message: 'Exactly one of `kinds` or `preset` is required.',
  })

export type AkAuditsInput = z.infer<typeof inputSchema>

const batchResultSchema = z.object({
  kind: z.string(),
  passed: z.boolean(),
  summary: z.string(),
  details: z.unknown(),
  isError: z.boolean().optional(),
})

const outputSchema = createSummaryOutputSchema({
  details: z.record(z.string(), z.unknown()),
}).extend({
  total: z.number(),
  passedCount: z.number(),
  failedCount: z.number(),
  failedKinds: z.array(z.string()),
  results: z.array(batchResultSchema),
})

export type AuditBatchResult = z.infer<typeof outputSchema>

function uniqueKinds(kinds: readonly MCPAuditKind[]): MCPAuditKind[] {
  const seen = new Set<MCPAuditKind>()
  const deduped: MCPAuditKind[] = []
  for (const kind of kinds) {
    if (seen.has(kind)) continue
    seen.add(kind)
    deduped.push(kind)
  }
  return deduped
}

function resolveKinds(input: AkAuditsInput): MCPAuditKind[] {
  if (input.kinds) return uniqueKinds(input.kinds)
  if (input.preset === 'guardrails') return [...GUARDRAIL_PRESET]
  return [...ALL_PRESET]
}

function toBatchEntry(payload: AuditPayload) {
  return {
    kind: payload.kind,
    passed: payload.passed,
    summary: payload.summary,
    details: payload.details,
  }
}

const tool: ToolDescriptor = {
  name: 'wp_audits',
  description:
    'Run multiple packaged repo audits in one deterministic batch. Provide `kinds` or preset `guardrails`/`all`; returns aggregate pass/fail plus per-audit results.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Batch audits',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw) => {
    let input: AkAuditsInput
    try {
      input = inputSchema.parse(raw ?? {})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return createSummaryResult(
        {
          passed: false,
          summary: 'Invalid wp_audits input',
          total: 0,
          passedCount: 0,
          failedCount: 0,
          failedKinds: [],
          results: [],
          details: { message },
        },
        { isError: true },
      )
    }

    const kinds = resolveKinds(input)
    const results = []
    for (const kind of kinds) {
      try {
        const payload = await dispatchAudit({
          kind,
          cwd: input.cwd,
          directory: input.directory,
          baseRef: input.baseRef,
          strict: input.strict,
        })
        results.push(toBatchEntry(payload))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        results.push({
          kind,
          passed: false,
          summary: `${kind} audit crashed`,
          details: message,
          isError: true,
        })
      }
    }

    const failedKinds = results.filter((result) => !result.passed).map((result) => result.kind)
    const passedCount = results.length - failedKinds.length
    const failedCount = failedKinds.length
    const passed = failedCount === 0
    return createSummaryResult({
      passed,
      summary: passed
        ? `wp_audits passed (${passedCount}/${results.length})`
        : `wp_audits failed (${failedCount}/${results.length}): ${failedKinds.join(', ')}`,
      total: results.length,
      passedCount,
      failedCount,
      failedKinds,
      results,
      details: { preset: input.preset, kinds },
    })
  },
}

export default tool
