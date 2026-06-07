/**
 * HookSpec IR — typed data model for the canonical wp-* hook specifications.
 *
 * This is the single source of truth for what hooks exist, which event they
 * belong to, which bin they invoke, and what their timeout is. All emitters
 * (Claude, Codex, Cursor) consume WP_HOOK_SPECS to build their vendor-specific
 * output formats.
 */

export type HookEntry = { type: string; command: string; timeout?: number }
export type HookGroup = { matcher?: string; hooks: HookEntry[] }
export type HooksMap = Record<string, HookGroup[]>

// Canonical hook event names recognised by both Claude Code and Codex CLI.
// Used by `hoistTopLevelEvents` to identify legacy flat-form keys to migrate.
export const HOOK_EVENT_NAMES = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
] as const

export type MatcherSet = {
  preToolUse: string
  postToolUse: string
}

/**
 * A single canonical wp-* hook specification. Describes which event a hook
 * belongs to, the bin it invokes, an optional matcher key referencing
 * MatcherSet, and the hook's measured timeout budget.
 */
export type HookSpec = {
  readonly event: (typeof HOOK_EVENT_NAMES)[number]
  readonly bin: string
  readonly matcher?: 'preToolUse' | 'postToolUse'
  readonly timeout: number
}

/**
 * The canonical 6 wp-* hook specs. Adding a new wp-* hook is one append here;
 * all emitters pick it up automatically.
 *
 * Timeouts are measured values (see buildWebpressoHookGroups comment in
 * index.ts for the measurement rationale behind each budget).
 */
export const WP_HOOK_SPECS: readonly HookSpec[] = [
  { event: 'SessionStart', bin: 'wp-sessionstart-routing', timeout: 5 },
  { event: 'SessionStart', bin: 'wp-check-dev-link', timeout: 5 },
  { event: 'PreToolUse', bin: 'wp-pretool-guard', matcher: 'preToolUse', timeout: 5 },
  { event: 'PostToolUse', bin: 'wp-post-tool', matcher: 'postToolUse', timeout: 15 },
  { event: 'UserPromptSubmit', bin: 'wp-guard-switch', timeout: 5 },
  { event: 'Stop', bin: 'wp-stop-qa', timeout: 10 },
]
