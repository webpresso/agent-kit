/**
 * Hook conformance matrix — the single source of truth for what every managed hook
 * must do at the real invocation boundary, for each host.
 *
 * Rows are discriminated by hook event so each event asserts against its OWN contract
 * (only PreToolUse has permission decisions; SessionStart emits additionalContext;
 * Stop/PostToolUse/UserPromptSubmit/PreCompact are fail-open / emit-empty-json). This
 * matrix is reused by:
 *   - the generated-command boundary smoke suite (P2),
 *   - the compiled-runtime parity replay (P4),
 *   - `wp hooks doctor --probe-decisions` (P5, smallest rows only).
 *
 * Host contracts (verified against vendor docs):
 *   - Claude Code: stdin is snake_case (tool_name/tool_input/hook_event_name); a deny is
 *     hookSpecificOutput.permissionDecision = "deny".
 *   - Codex: stdin adds tool_use_id/turn_id; deny is the same hookSpecificOutput shape,
 *     but permissionDecision "ask" and continue/stopReason/suppressOutput are UNSUPPORTED
 *     (Codex fails the hook run on them) — so our output must never contain them.
 */

export type HookHost = 'claude' | 'codex'

export const WEBPRESSO_HOOK_BINS = [
  'wp-pretool-guard',
  'wp-post-tool',
  'wp-stop-qa',
  'wp-guard-switch',
  'wp-sessionstart-routing',
  'wp-precompact-snapshot',
] as const
export type WebpressoHookBin = (typeof WEBPRESSO_HOOK_BINS)[number]

/** Output captured from running a hook bin against a row's stdin. */
export type HookRunResult = {
  readonly stdout: string
  readonly exitCode: number | null
}

type BaseRow = {
  readonly name: string
  readonly hookBin: WebpressoHookBin
  readonly host: HookHost
  /** Host-shaped JSON payload delivered on the hook's stdin. */
  readonly stdin: string
  /** Smallest representative rows used by the cheap `doctor --probe-decisions` path. */
  readonly probe?: boolean
}

export type PreToolUseRow = BaseRow & {
  readonly event: 'PreToolUse'
  readonly hookBin: 'wp-pretool-guard'
  /** `allow` = no deny envelope; `deny` = a deny envelope routing to an MCP tool. */
  readonly expect: 'allow' | 'deny'
}

export type SessionStartRow = BaseRow & {
  readonly event: 'SessionStart'
  readonly hookBin: 'wp-sessionstart-routing'
}

/** Stop / PostToolUse / UserPromptSubmit / PreCompact: fail-open, must emit valid JSON. */
export type EmptyJsonRow = BaseRow & {
  readonly event: 'PostToolUse' | 'Stop' | 'UserPromptSubmit' | 'PreCompact'
}

export type ConformanceRow = PreToolUseRow | SessionStartRow | EmptyJsonRow

// ---------------------------------------------------------------------------
// Host-shaped stdin builders
// ---------------------------------------------------------------------------

function claudeBase(event: string): Record<string, unknown> {
  return {
    session_id: 'conformance-session',
    transcript_path: null,
    cwd: '/repo',
    hook_event_name: event,
  }
}

function codexBase(event: string): Record<string, unknown> {
  return { ...claudeBase(event), turn_id: 'conformance-turn' }
}

export function bashPayload(host: HookHost, event: string, command: string): string {
  const base = host === 'codex' ? codexBase(event) : claudeBase(event)
  const toolFields =
    host === 'codex'
      ? { tool_name: 'Bash', tool_use_id: 'conformance-tool-use', tool_input: { command } }
      : { tool_name: 'Bash', tool_input: { command } }
  return JSON.stringify({ ...base, ...toolFields })
}

export function eventPayload(host: HookHost, event: string): string {
  return JSON.stringify(host === 'codex' ? codexBase(event) : claudeBase(event))
}

// ---------------------------------------------------------------------------
// Assertions (per-event, host-aware) — throw with a descriptive message on mismatch
// ---------------------------------------------------------------------------

/** Fields Codex parses but fails-closed on; our output must never contain them. */
const CODEX_UNSUPPORTED_TOP_LEVEL = ['continue', 'stopReason', 'suppressOutput'] as const

function parseStdout(row: ConformanceRow, result: HookRunResult): Record<string, unknown> | null {
  const text = result.stdout.trim()
  if (text === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(
      `[${row.name}] hook stdout is not valid JSON: ${JSON.stringify(text.slice(0, 200))}`,
    )
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`[${row.name}] hook stdout JSON is not an object: ${text.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

function denyDecision(obj: Record<string, unknown> | null): string | null {
  const hookSpecific = obj?.hookSpecificOutput
  if (hookSpecific && typeof hookSpecific === 'object') {
    const decision = (hookSpecific as Record<string, unknown>).permissionDecision
    if (typeof decision === 'string') return decision
  }
  // Legacy block shape both hosts accept.
  if (obj?.decision === 'block') return 'deny'
  return null
}

function assertNoCodexUnsupportedFields(
  row: ConformanceRow,
  obj: Record<string, unknown> | null,
): void {
  if (row.host !== 'codex' || obj === null) return
  for (const field of CODEX_UNSUPPORTED_TOP_LEVEL) {
    if (field in obj) {
      throw new Error(
        `[${row.name}] Codex-bound hook output must not contain unsupported field "${field}"`,
      )
    }
  }
  const decision = denyDecision(obj)
  if (decision === 'ask') {
    throw new Error(
      `[${row.name}] Codex-bound hook must not emit permissionDecision "ask" (unsupported)`,
    )
  }
}

/**
 * Exit-code expectation. A non-zero exit means the hook process errored/crashed — a
 * crashing hook that prints nothing would otherwise pass an "allow" row (empty stdout),
 * the exact false-confidence this matrix guards against. A PreToolUse deny is the one
 * place a non-zero exit (2) is a legitimate signal (the exit-code deny convention).
 */
function assertExitCode(row: ConformanceRow, result: HookRunResult, allowExitTwo: boolean): void {
  const exit = result.exitCode
  if (exit === 0) return
  if (allowExitTwo && exit === 2) return
  throw new Error(
    `[${row.name}] hook exited with ${exit ?? 'null'} (expected ${allowExitTwo ? '0 or 2' : '0'}) — a non-zero exit means the hook crashed/errored, not a clean decision`,
  )
}

/** Validate a hook run result against the row's per-event contract. Throws on failure. */
export function assertConformance(row: ConformanceRow, result: HookRunResult): void {
  const obj = parseStdout(row, result)
  // Stdout, when present, must be valid JSON for every event/host (asserted by parseStdout).
  assertNoCodexUnsupportedFields(row, obj)

  switch (row.event) {
    case 'PreToolUse': {
      const decision = denyDecision(obj)
      if (row.expect === 'deny') {
        // A deny is signalled by the envelope OR a hard exit 2 (exit-code deny convention).
        const denied = decision === 'deny' || result.exitCode === 2
        if (!denied) {
          throw new Error(
            `[${row.name}] expected a PreToolUse deny, got ${decision ?? 'allow'} (exit ${result.exitCode ?? 'null'}, stdout: ${result.stdout.slice(0, 160)})`,
          )
        }
      } else {
        if (decision === 'deny') {
          throw new Error(
            `[${row.name}] expected PreToolUse allow but hook DENIED (stdout: ${result.stdout.slice(0, 160)})`,
          )
        }
        // An allow must be a CLEAN exit — a crashed hook (non-zero) is not an allow.
        assertExitCode(row, result, false)
      }
      return
    }
    case 'SessionStart':
      // SessionStart routing emits additionalContext (or empty) and must exit cleanly.
      assertExitCode(row, result, false)
      return
    default:
      // Stop / PostToolUse / UserPromptSubmit / PreCompact are fail-open: empty stdout or
      // valid JSON, but must still exit 0 — a crash is a real failure, not "fail-open".
      assertExitCode(row, result, false)
      return
  }
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

function preToolRows(host: HookHost): readonly PreToolUseRow[] {
  return [
    // Over-match regression (the P0 bug): sibling subcommands must be ALLOWED.
    {
      name: `${host}:pretool allow gh pr merge`,
      hookBin: 'wp-pretool-guard',
      host,
      event: 'PreToolUse',
      expect: 'allow',
      probe: true,
      stdin: bashPayload(host, 'PreToolUse', 'gh pr merge 257 --squash'),
    },
    {
      name: `${host}:pretool allow wrangler deploy`,
      hookBin: 'wp-pretool-guard',
      host,
      event: 'PreToolUse',
      expect: 'allow',
      stdin: bashPayload(host, 'PreToolUse', 'wrangler deploy'),
    },
    {
      name: `${host}:pretool allow benign echo`,
      hookBin: 'wp-pretool-guard',
      host,
      event: 'PreToolUse',
      expect: 'allow',
      stdin: bashPayload(host, 'PreToolUse', 'echo hello'),
    },
    // Intended denies must still fire.
    {
      name: `${host}:pretool deny gh pr view`,
      hookBin: 'wp-pretool-guard',
      host,
      event: 'PreToolUse',
      expect: 'deny',
      probe: true,
      stdin: bashPayload(host, 'PreToolUse', 'gh pr view 257'),
    },
    {
      name: `${host}:pretool deny vitest`,
      hookBin: 'wp-pretool-guard',
      host,
      event: 'PreToolUse',
      expect: 'deny',
      stdin: bashPayload(host, 'PreToolUse', 'vitest run'),
    },
  ]
}

export const CONFORMANCE_MATRIX: readonly ConformanceRow[] = [
  ...preToolRows('claude'),
  ...preToolRows('codex'),
  {
    name: 'claude:sessionstart',
    hookBin: 'wp-sessionstart-routing',
    host: 'claude',
    event: 'SessionStart',
    stdin: eventPayload('claude', 'SessionStart'),
  },
  {
    name: 'codex:sessionstart',
    hookBin: 'wp-sessionstart-routing',
    host: 'codex',
    event: 'SessionStart',
    stdin: eventPayload('codex', 'SessionStart'),
  },
  {
    name: 'claude:stop',
    hookBin: 'wp-stop-qa',
    host: 'claude',
    event: 'Stop',
    stdin: eventPayload('claude', 'Stop'),
  },
  {
    name: 'codex:stop',
    hookBin: 'wp-stop-qa',
    host: 'codex',
    event: 'Stop',
    stdin: eventPayload('codex', 'Stop'),
  },
  {
    name: 'claude:posttool',
    hookBin: 'wp-post-tool',
    host: 'claude',
    event: 'PostToolUse',
    stdin: bashPayload('claude', 'PostToolUse', 'echo done'),
  },
  {
    name: 'claude:userpromptsubmit',
    hookBin: 'wp-guard-switch',
    host: 'claude',
    event: 'UserPromptSubmit',
    stdin: eventPayload('claude', 'UserPromptSubmit'),
  },
  {
    name: 'claude:precompact',
    hookBin: 'wp-precompact-snapshot',
    host: 'claude',
    event: 'PreCompact',
    stdin: eventPayload('claude', 'PreCompact'),
  },
]

/** The smallest allow/deny rows, for the cheap `doctor --probe-decisions` path. */
export const PROBE_ROWS: readonly ConformanceRow[] = CONFORMANCE_MATRIX.filter(
  (row) => row.probe === true,
)
