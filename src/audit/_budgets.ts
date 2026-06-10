/**
 * Agent-kit audit budgets — default values and per-repo override loading.
 *
 * Consumers may create `.agent/.audit-budgets.yaml` to override the defaults.
 * Missing keys fall back to `DEFAULT_BUDGETS`.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

const budgetEntrySchema = z
  .object({
    max_bytes: z.number().int().positive().optional(),
    max: z.number().int().positive().optional(),
    max_days: z.number().int().positive().optional(),
    suggest_compact_at: z.number().min(0).max(1).optional(),
    warn_pct: z.number().min(1).optional(),
  })
  .refine(
    (entry) =>
      entry.max_bytes !== undefined || entry.max !== undefined || entry.max_days !== undefined,
    {
      message: 'budget entry must define at least one of max_bytes, max, or max_days',
    },
  )

const budgetFileSchema = z.object({
  budgets: z.record(z.string(), budgetEntrySchema),
})

export const DEFAULT_BUDGETS = {
  'codex-skill-listing-total': { max_bytes: 7000 },
  'claude-skill-description-each': { max_bytes: 800 },
  'agents-md-section-each': { max_bytes: 4096, suggest_compact_at: 0.75 },
  'skill-md-total-each': { max_bytes: 16384 },
  'blueprint-wip-in-progress-max': { max: 3 },
  'blueprint-stale-in-progress-days': { max_days: 14 },
} as const satisfies Record<
  string,
  {
    max_bytes?: number
    max?: number
    max_days?: number
    suggest_compact_at?: number
    warn_pct?: number
  }
>

export type BudgetKey = keyof typeof DEFAULT_BUDGETS

export type BudgetEntry = {
  max_bytes?: number
  max?: number
  max_days?: number
  suggest_compact_at?: number
  warn_pct?: number
}

export type ResolvedBudgets = typeof DEFAULT_BUDGETS & Record<string, BudgetEntry>

/**
 * Load budgets from `.agent/.audit-budgets.yaml` if present, merging with defaults.
 * Unknown keys from the file are accepted; missing keys fall back to defaults.
 */
export function loadBudgets(cwd: string): ResolvedBudgets {
  const configPath = path.join(cwd, '.agent', '.audit-budgets.yaml')
  if (!existsSync(configPath)) {
    return { ...DEFAULT_BUDGETS } as ResolvedBudgets
  }

  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch {
    return { ...DEFAULT_BUDGETS } as ResolvedBudgets
  }

  // Lazy import yaml to keep startup fast
  let parsed: unknown
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse: parseYaml } = require('yaml') as { parse: (s: string) => unknown }
    parsed = parseYaml(raw)
  } catch {
    return { ...DEFAULT_BUDGETS } as ResolvedBudgets
  }

  const result = budgetFileSchema.safeParse(parsed)
  if (!result.success) {
    return { ...DEFAULT_BUDGETS } as ResolvedBudgets
  }

  // Merge: file overrides defaults; unknown file keys are included as-is
  return {
    ...DEFAULT_BUDGETS,
    ...result.data.budgets,
  } as ResolvedBudgets
}
