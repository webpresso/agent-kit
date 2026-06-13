/**
 * HookSpec IR — typed data model for the canonical wp-* hook specifications.
 *
 * This is the single source of truth for what hooks exist, which event they
 * belong to, which bin they invoke, and what their timeout is. All emitters
 * (Claude, Codex, Cursor) consume WP_HOOK_SPECS to build their vendor-specific
 * output formats.
 */

export type HookEntry = {
  type: string
  command: string
  timeout?: number
  statusMessage?: string
}
export type HookGroup = { matcher?: string; hooks: HookEntry[] }
export type HooksMap = Record<string, HookGroup[]>

// Known hook event names across the documented Claude/Codex lifecycle. Used by
// migration/validation paths to identify legacy flat-form keys and by CLI
// helpers like `wp hooks dispatch` / `wp hooks demo` to accept a wider event
// vocabulary than the narrower managed `wp-*` emission subset.
export const HOOK_EVENT_NAMES = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'UserPromptSubmit',
  'Stop',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd',
  'PreCompact',
  'PostCompact',
] as const

export type MatcherSet = {
  preToolUse: string
  postToolUse: string
}

/**
 * A single canonical wp-* hook specification. Describes which event a hook
 * belongs to, the bin it invokes, an optional matcher key referencing
 * MatcherSet, and the hook's measured timeout budget.
 *
 * `jsonOnly` marks events where the hook runner MUST emit valid JSON on stdout.
 * Codex mandates this for Stop and SubagentStop: "Plain text output is
 * invalid". Claude Code also accepts JSON-only stdout for these events.
 */
export type HookSpec = {
  readonly event: (typeof HOOK_EVENT_NAMES)[number]
  readonly bin: string
  readonly hookName: string
  readonly matcher?: 'preToolUse' | 'postToolUse'
  readonly timeout: number
  readonly jsonOnly?: boolean
}

/**
 * The canonical 6 wp-* hook specs. Adding a new wp-* hook is one append here;
 * all emitters pick it up automatically.
 *
 * Timeouts are measured values (see buildWebpressoHookGroups comment in
 * index.ts for the measurement rationale behind each budget).
 */
export const WP_HOOK_SPECS: readonly HookSpec[] = [
  {
    event: 'SessionStart',
    bin: 'wp-sessionstart-routing',
    hookName: 'sessionstart-routing',
    timeout: 5,
  },
  {
    event: 'PreToolUse',
    bin: 'wp-pretool-guard',
    hookName: 'pretool-guard',
    matcher: 'preToolUse',
    timeout: 5,
  },
  {
    event: 'PostToolUse',
    bin: 'wp-post-tool',
    hookName: 'post-tool',
    matcher: 'postToolUse',
    timeout: 15,
  },
  { event: 'UserPromptSubmit', bin: 'wp-guard-switch', hookName: 'guard-switch', timeout: 5 },
  { event: 'Stop', bin: 'wp-stop-qa', hookName: 'stop-qa', timeout: 10, jsonOnly: true },
]

/**
 * The subset of HOOK_EVENT_NAMES that webpresso currently emits as managed
 * `wp-*` hooks today. Wider lifecycle names remain accepted by dispatch/demo
 * and represented in the capability matrix, but not every host-known event has
 * a managed hook group yet.
 */
export const MANAGED_HOOK_EVENT_NAMES = [
  ...new Set(WP_HOOK_SPECS.map((spec) => spec.event)),
] as readonly (typeof HOOK_EVENT_NAMES)[number][]

/**
 * The managed wp-* hook bin names, derived from WP_HOOK_SPECS. Single source of
 * truth for the installed-launcher, codex-ownership, and claude-emit bin lists:
 * derive from this, never re-list, so adding a wp-* hook spec cannot silently
 * drift one consumer (e.g. a hook that emits a launcher but is missed by codex
 * ownership detection).
 */
export const WP_HOOK_BIN_NAMES: readonly string[] = WP_HOOK_SPECS.map((spec) => spec.bin)
