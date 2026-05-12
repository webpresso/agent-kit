/**
 * Tail-hint rate limiting for blueprint MCP tools.
 *
 * Hints are static strings shown at the end of tool responses to nudge the
 * agent toward the next logical step. Rate-limited per hint per cwd — once
 * shown, a hint is suppressed for 7 days so it doesn't flood every response.
 *
 * History is persisted to `.agent/.tail-hint-history.jsonl` in the consumer
 * repo. Each line is a JSON record: `{ hintId, cwd, ts }`.
 */

import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'


export const TAIL_HINTS = {
  PLL_PARALLEL: 'Consider /pll for parallel execution.',
  VERIFY_DONE: 'Run /verify to confirm done-ness before finalizing.',
  PLAN_REFINE: 'Run /plan-refine to harden this blueprint.',
  AUDIT_FIX: 'Run /verify or `ak audit --fix` before finalizing.',
} as const

export type TailHintId = keyof typeof TAIL_HINTS

const HINT_HISTORY_FILENAME = '.tail-hint-history.jsonl'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

interface HintRecord {
  hintId: string
  cwd: string
  ts: number
}

function historyPath(cwd: string): string {
  return path.join(cwd, '.agent', HINT_HISTORY_FILENAME)
}

function readHistory(cwd: string): HintRecord[] {
  const file = historyPath(cwd)
  if (!existsSync(file)) return []
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
  const records: HintRecord[] = []
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'hintId' in parsed &&
        'cwd' in parsed &&
        'ts' in parsed
      ) {
        records.push(parsed as HintRecord)
      }
    } catch {
      // skip malformed lines
    }
  }
  return records
}

/**
 * Returns true when the hint should be shown (not shown in last 7 days).
 */
export function shouldShowHint(cwd: string, hintId: TailHintId): boolean {
  const history = readHistory(cwd)
  const cutoff = Date.now() - SEVEN_DAYS_MS
  const recent = history.find((r) => r.hintId === hintId && r.cwd === cwd && r.ts >= cutoff)
  return recent === undefined
}

/**
 * Records that the hint was shown. Appends to `.agent/.tail-hint-history.jsonl`.
 */
export function recordHint(cwd: string, hintId: TailHintId): void {
  const file = historyPath(cwd)
  const dir = path.dirname(file)
  mkdirSync(dir, { recursive: true })
  const record: HintRecord = { hintId, cwd, ts: Date.now() }
  appendFileSync(file, JSON.stringify(record) + '\n', 'utf8')
}

/**
 * Returns the hint string if it should be shown, otherwise null.
 * Also records the hint if shown.
 */
export function maybeHint(cwd: string, hintId: TailHintId): string | null {
  if (!shouldShowHint(cwd, hintId)) return null
  recordHint(cwd, hintId)
  return TAIL_HINTS[hintId]
}
