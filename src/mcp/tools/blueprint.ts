/**
 * `ak_blueprint` MCP tool.
 *
 * Wraps `ak blueprint new|audit|list` behind a single MCP tool with a
 * discriminated-union input schema. Dispatch is direct library import — we
 * call the same router-level functions the CLI uses (`createBlueprint`,
 * `auditBlueprints`, `listBlueprints`) so we avoid a shell-out hop and
 * preserve typed return values.
 *
 * On error, returns a structured `{action, passed: false, error}` envelope
 * inside the MCP `text` content block instead of throwing — the MCP server
 * must keep running across bad inputs.
 */

import { z } from 'zod'

import {
  auditBlueprints,
  createBlueprint,
  listBlueprints,
} from '#cli/commands/blueprint/router'

import type { ToolDescriptor } from '../auto-discover.js'

const inputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('new'),
    goal: z.string(),
    complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']).default('M'),
  }),
  z.object({
    action: z.literal('audit'),
    path: z.string().optional(),
    all: z.boolean().optional().default(false),
    strict: z.boolean().optional().default(false),
    staged: z.boolean().optional().default(false),
  }),
  z.object({
    action: z.literal('list'),
    status: z
      .enum(['draft', 'planned', 'parked', 'in-progress', 'completed', 'archived'])
      .optional(),
  }),
])

export type AkBlueprintInput = z.infer<typeof inputSchema>

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function jsonContent(payload: unknown): { content: { type: string; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

const tool: ToolDescriptor = {
  name: 'ak_blueprint',
  description:
    'Manage agent-kit blueprints. `action: "new"` creates a draft blueprint, `action: "audit"` validates blueprints (returns {passed, errors}), `action: "list"` returns blueprint summaries. Returns a structured error envelope (no throw) on failure.',
  inputSchema,
  handler: async (raw): Promise<{ content: { type: string; text: string }[] }> => {
    let parsed: AkBlueprintInput
    try {
      parsed = inputSchema.parse(raw ?? {}) as AkBlueprintInput
    } catch (err) {
      return jsonContent({
        action: (raw as { action?: string } | null)?.action ?? 'unknown',
        passed: false,
        error: toErrorMessage(err),
      })
    }

    if (parsed.action === 'new') {
      try {
        const created = await createBlueprint(parsed.goal, { complexity: parsed.complexity })
        return jsonContent({ action: 'new', path: created.path })
      } catch (err) {
        return jsonContent({ action: 'new', passed: false, error: toErrorMessage(err) })
      }
    }

    if (parsed.action === 'audit') {
      try {
        const result = await auditBlueprints({
          all: parsed.all,
          strict: parsed.strict,
          staged: parsed.staged,
        })
        const errorIssues = result.issues.filter((issue) => issue.level === 'error')
        const errors = errorIssues.map((issue) =>
          issue.file ? `${issue.file}: ${issue.message}` : issue.message,
        )
        const passed = result.ok && errorIssues.length === 0
        return jsonContent({ action: 'audit', passed, errors })
      } catch (err) {
        return jsonContent({ action: 'audit', passed: false, error: toErrorMessage(err) })
      }
    }

    // parsed.action === 'list'
    try {
      const summaries = await listBlueprints({ status: parsed.status })
      const blueprints = summaries.map((s) => ({
        slug: s.name,
        status: s.status,
        title: s.title,
        progress: s.taskCount > 0 ? `${s.progress}/${s.taskCount}` : '0/0',
      }))
      return jsonContent({ action: 'list', blueprints })
    } catch (err) {
      return jsonContent({ action: 'list', passed: false, error: toErrorMessage(err) })
    }
  },
}

export default tool
