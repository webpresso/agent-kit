import { z } from 'zod'
import type Database from 'better-sqlite3'

import { QUERY_TEMPLATES, findTemplate } from './templates.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TemplateRunResult {
  readonly rows: unknown[]
  readonly capped: boolean
  readonly rowCount: number
}

// ---------------------------------------------------------------------------
// Default param values applied before Zod validation
// ---------------------------------------------------------------------------

const PARAM_DEFAULTS: Record<string, Record<string, unknown>> = {
  'next-ready-task':      { limit: 5 },
  'tech-debt-due-soon':   { limit: 20, days: 14 },
  'completed-this-month': { limit: 20 },
  'overdue-tech-debt':    { limit: 20 },
}

// ---------------------------------------------------------------------------
// runTemplate
// ---------------------------------------------------------------------------

export function runTemplate(
  db: Database.Database,
  templateId: string,
  params: Record<string, unknown>,
): TemplateRunResult {
  const template = findTemplate(templateId)
  if (template === undefined) {
    const available = QUERY_TEMPLATES.map((t) => `"${t.id}"`).join(', ')
    throw new Error(`Unknown template id: "${templateId}". Available: ${available}`)
  }

  // Merge caller params over defaults for this template
  const defaults = PARAM_DEFAULTS[templateId] ?? {}
  const merged: Record<string, unknown> = { ...defaults, ...params }

  // Validate params against the template's Zod schema
  const parsed = template.paramSchema.safeParse(merged)
  if (!parsed.success) {
    throw new z.ZodError(parsed.error.issues)
  }

  const validatedParams = parsed.data as Record<string, unknown>

  // Enforce the template's row cap — use the lesser of caller's limit and maxRows
  const callerLimit = typeof validatedParams['limit'] === 'number'
    ? validatedParams['limit']
    : template.maxRows
  const effectiveLimit = Math.min(callerLimit, template.maxRows)

  // Build the final param object with the effective limit substituted
  const runParams: Record<string, unknown> = { ...validatedParams, limit: effectiveLimit }

  let sql = template.sql

  // Special: cross-repo-blocked-on supports an optional org_filter
  if (templateId === 'cross-repo-blocked-on' && typeof runParams['org_filter'] === 'string') {
    // Wrap in a SELECT that adds a LIKE filter on target_repo
    sql = `SELECT * FROM (${sql}) WHERE target_repo LIKE :org_filter || '%'`
  }

  // For queries without a LIMIT placeholder, wrap with an outer LIMIT clause
  const sqlHasLimit = sql.includes(':limit')
  const finalSql = sqlHasLimit ? sql : `SELECT * FROM (${sql}) LIMIT ${effectiveLimit}`

  const stmt = db.prepare(finalSql)

  // Only pass named params that are actually referenced in the SQL to avoid
  // better-sqlite3 "unknown binding" errors
  const stmtParams = _filterParams(runParams, finalSql)

  const rows = stmt.all(stmtParams) as unknown[]
  const capped = rows.length >= effectiveLimit

  return { rows, capped, rowCount: rows.length }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip keys from params that are not referenced as :name in the SQL. */
function _filterParams(
  params: Record<string, unknown>,
  sql: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (sql.includes(`:${key}`)) {
      result[key] = value
    }
  }
  return result
}
