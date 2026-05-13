/**
 * `ak_blueprint` MCP tool.
 *
 * Wraps `ak blueprint new|audit|list|transition` behind a single MCP tool with
 * a discriminated-union input schema. Dispatch is direct library import — we
 * call the same router-level functions the CLI uses (`createBlueprint`,
 * `auditBlueprints`, `listBlueprints`, `promoteBlueprintToState`) so we avoid
 * a shell-out hop and preserve typed return values.
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
  promoteBlueprintToState,
} from '#cli/commands/blueprint/router'

import type { ToolDescriptor } from '#mcp/auto-discover'

/**
 * Flat-object schema with handler-side per-action validation.
 *
 * MCP spec (`ToolSchema` in @modelcontextprotocol/sdk) REQUIRES the tool's
 * `inputSchema.type` to be `"object"` at the root. A `z.discriminatedUnion`
 * would serialize to `{ oneOf: [...] }` with no root `type` and the MCP
 * client rejects the tool list with:
 *   `"path": ["tools", N, "inputSchema", "type"], "message": "expected 'object'"`.
 *
 * We keep the discriminated semantics (per-action required fields) inside
 * `superRefine` so JSON-schema clients see one valid object shape while
 * the runtime still enforces the dispatch contract.
 */
const ACTIONS = ['new', 'audit', 'list', 'transition'] as const

const TRANSITION_TARGETS = ['planned', 'in-progress', 'completed', 'parked'] as const

const inputSchema = z
  .object({
    action: z.enum(ACTIONS),
    // `new`-only:
    goal: z.string().optional(),
    complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional(),
    // `audit`-only:
    path: z.string().optional(),
    all: z.boolean().optional(),
    strict: z.boolean().optional(),
    staged: z.boolean().optional(),
    // `list`-only:
    status: z
      .enum(['draft', 'planned', 'parked', 'in-progress', 'completed', 'archived'])
      .optional(),
    // `transition`-only:
    slug: z.string().optional(),
    to: z.enum(TRANSITION_TARGETS).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'new' && !data.goal) {
      ctx.addIssue({
        code: 'custom',
        path: ['goal'],
        message: '`goal` is required when action is "new"',
      })
    }
    if (data.action === 'transition') {
      if (!data.slug) {
        ctx.addIssue({
          code: 'custom',
          path: ['slug'],
          message: '`slug` is required when action is "transition"',
        })
      }
      if (!data.to) {
        ctx.addIssue({
          code: 'custom',
          path: ['to'],
          message: '`to` is required when action is "transition"',
        })
      }
    }
  })

export type AkBlueprintInput = z.infer<typeof inputSchema>

const DEFAULT_COMPLEXITY = 'M' as const

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function jsonContent(
  payload: unknown,
  options: { isError?: boolean } = {},
): { content: { type: string; text: string }[]; isError?: boolean } {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...(options.isError ? { isError: true } : {}),
  }
}

const tool: ToolDescriptor = {
  name: 'ak_blueprint',
  description:
    'Manage agent-kit blueprints. `action: "new"` creates a draft blueprint, `action: "audit"` validates blueprints (returns {passed, errors}), `action: "list"` returns blueprint summaries, `action: "transition"` moves a blueprint to a target lifecycle state (`to: "planned" | "in-progress" | "completed" | "parked"`) — atomically updates the frontmatter status AND moves the directory under `blueprints/<to>/`. Returns a structured error envelope (no throw) on failure.',
  inputSchema,
  // `action: "new"` writes a blueprint file (destructive). `audit` and `list`
  // are read-only. We can't split the annotation per-action, so we declare
  // the strictest applicable shape — clients gate the whole tool behind a
  // confirmation prompt. Acceptable: blueprint creation is operator-driven
  // and rare; lint/typecheck/qa/audit cover the high-frequency read-only
  // surface where annotation savings matter most.
  annotations: {
    title: 'Blueprint',
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (raw): Promise<{ content: { type: string; text: string }[] }> => {
    let parsed: AkBlueprintInput
    try {
      parsed = inputSchema.parse(raw ?? {}) as AkBlueprintInput
    } catch (err) {
      // Schema validation failure → tool didn't run → isError per spec.
      return jsonContent(
        {
          action: (raw as { action?: string } | null)?.action ?? 'unknown',
          passed: false,
          error: toErrorMessage(err),
        },
        { isError: true },
      )
    }

    if (parsed.action === 'new') {
      try {
        // `superRefine` already guarantees `goal` is present when action is "new";
        // narrow + apply the default complexity that the discriminated union used to inline.
        const goal = parsed.goal as string
        const complexity = parsed.complexity ?? DEFAULT_COMPLEXITY
        const created = await createBlueprint(goal, { complexity })
        return jsonContent({ action: 'new', path: created.path })
      } catch (err) {
        return jsonContent(
          { action: 'new', passed: false, error: toErrorMessage(err) },
          { isError: true },
        )
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
        // `passed: false` here means "audit ran and found violations" —
        // normal output the agent can act on, NOT isError.
        return jsonContent({ action: 'audit', passed, errors })
      } catch (err) {
        return jsonContent(
          { action: 'audit', passed: false, error: toErrorMessage(err) },
          { isError: true },
        )
      }
    }

    if (parsed.action === 'list') {
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
        return jsonContent(
          { action: 'list', passed: false, error: toErrorMessage(err) },
          { isError: true },
        )
      }
    }

    // parsed.action === 'transition'
    try {
      // `superRefine` already guarantees `slug` and `to` are present; narrow.
      const slug = parsed.slug as string
      const to = parsed.to as (typeof TRANSITION_TARGETS)[number]
      const result = await promoteBlueprintToState(slug, to)
      return jsonContent({
        action: 'transition',
        slug: result.slug,
        from: result.oldState,
        to: result.newState,
        path: result.newPath,
      })
    } catch (err) {
      return jsonContent(
        { action: 'transition', passed: false, error: toErrorMessage(err) },
        { isError: true },
      )
    }
  },
}

export default tool
