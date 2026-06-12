/**
 * Status vocabulary for hook status reporting. Only the states that
 * `specStatus` (status/index.ts) actually produces are represented here; add a
 * term when a producer for it lands, not before.
 */

export const HOOK_STATUS = {
  installed: 'installed',
  enforcing: 'enforcing', // guard-class hook actively denying
  disabled: 'disabled', // explicitly disabled
} as const

export type HookStatus = (typeof HOOK_STATUS)[keyof typeof HOOK_STATUS]

export type HookStatusDetail = {
  readonly hook: string // bin name, e.g. 'wp-pretool-guard'
  readonly event: string // e.g. 'PreToolUse'
  readonly vendor: 'claude' | 'codex' | 'cursor'
  readonly status: HookStatus
  readonly reason?: string // only when degraded/disabled
  readonly nextCommand?: string // suggested fix command, e.g. 'wp setup'
}

const COL_WIDTHS = {
  event: 20,
  hook: 28,
  vendor: 8,
  status: 20,
} as const

function padRight(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

/**
 * Format a HookStatusDetail for terminal output (one line).
 *
 * Example:
 *   PreToolUse           wp-pretool-guard             claude    enforcing
 *   SessionStart         wp-sessionstart-routing      codex     disabled       → run: wp setup
 */
export function formatStatusLine(detail: HookStatusDetail): string {
  const parts = [
    padRight(detail.event, COL_WIDTHS.event),
    padRight(detail.hook, COL_WIDTHS.hook),
    padRight(detail.vendor, COL_WIDTHS.vendor),
    padRight(detail.status, COL_WIDTHS.status),
  ]

  const suffix: string[] = []
  if (detail.reason) suffix.push(`reason: ${detail.reason}`)
  if (detail.nextCommand) suffix.push(`→ run: ${detail.nextCommand}`)

  const line = parts.join('  ').trimEnd()
  return suffix.length > 0 ? `${line}  ${suffix.join('  ')}` : line
}
