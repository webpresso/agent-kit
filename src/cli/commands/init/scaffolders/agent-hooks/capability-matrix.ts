/**
 * Capability matrix — per-vendor, per-event hook support data.
 *
 * Documents what each agent CLI supports for each hook event, based on
 * official docs. Used by T13 (status), T14 (deny), and T22 (audit) to
 * explain gaps and emit correct per-vendor configurations.
 *
 * cursor column is populated with best-effort data; T8 (cursor emitter)
 * will refine it further.
 */

export type SupportLevel = 'full' | 'partial' | 'unmapped' | 'unsupported'

export type VendorCapability = {
  readonly event: string
  readonly claude: SupportLevel
  readonly codex: SupportLevel
  readonly cursor: SupportLevel
  readonly notes?: string
}

/**
 * Canonical capability matrix for all hook events across supported agent CLIs.
 *
 * claude/codex are Tier 1 CLIs (see supported-agent-clis.md).
 * cursor is Tier 3 (not officially supported) — data is best-effort.
 */
export const CAPABILITY_MATRIX: readonly VendorCapability[] = [
  {
    event: 'SessionStart',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
  },
  {
    event: 'PreToolUse',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
  },
  {
    event: 'PostToolUse',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
    notes: 'Cursor maps to afterShell',
  },
  {
    event: 'UserPromptSubmit',
    claude: 'full',
    codex: 'unsupported',
    cursor: 'partial',
    notes: 'Cursor maps to beforeSubmitPrompt',
  },
  {
    event: 'Stop',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
    notes: 'Cursor maps to afterShell',
  },
  {
    event: 'PermissionRequest',
    claude: 'full',
    codex: 'full',
    cursor: 'unmapped',
    notes: 'Not in third-party cursor mapping',
  },
  {
    event: 'SubagentStart',
    claude: 'full',
    codex: 'full',
    cursor: 'unsupported',
    notes: 'Native-only; cursor has no subagent concept',
  },
  {
    event: 'SubagentStop',
    claude: 'full',
    codex: 'full',
    cursor: 'unsupported',
    notes: 'Native-only; cursor has no subagent concept',
  },
  {
    event: 'PreCompact',
    claude: 'full',
    codex: 'full',
    cursor: 'unsupported',
  },
  {
    event: 'PostCompact',
    claude: 'full',
    codex: 'full',
    cursor: 'unsupported',
  },
]
