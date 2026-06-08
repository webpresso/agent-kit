/**
 * Capability matrix — per-vendor, per-event hook support data.
 *
 * Documents what each agent CLI supports for each hook event, based on
 * official docs. Used by T13 (status), T14 (deny), and T22 (audit) to
 * explain gaps and emit correct per-vendor configurations.
 *
 * cursor column reflects the emitted Cursor hooks.json surface plus the
 * documented third-party compatibility caveats (opt-in compat, required
 * `version: 1`, and unmapped events).
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
 * cursor remains below Tier 1 promotion until dedicated CI/audit work lands,
 * but the event rows below now match the emitted config shape.
 */
export const CAPABILITY_MATRIX: readonly VendorCapability[] = [
  {
    event: 'SessionStart',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
    notes: 'Cursor requires project hooks.json with version: 1',
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
    event: 'PostToolUseFailure',
    claude: 'partial',
    codex: 'unsupported',
    cursor: 'unsupported',
    notes:
      'Claude documents this event, but the current managed wp-* surface does not emit a dedicated failure hook',
  },
  {
    event: 'UserPromptSubmit',
    claude: 'full',
    codex: 'full',
    cursor: 'partial',
    notes: 'Cursor maps to beforeSubmitPrompt; third-party compat must be enabled',
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
    claude: 'partial',
    codex: 'partial',
    cursor: 'unmapped',
    notes:
      'Known upstream event, but the current managed wp-* surface does not install a dedicated permission hook',
  },
  {
    event: 'SubagentStart',
    claude: 'partial',
    codex: 'partial',
    cursor: 'unsupported',
    notes: 'Native-only event; current managed wp-* surface does not emit a dedicated subagent-start hook',
  },
  {
    event: 'SubagentStop',
    claude: 'partial',
    codex: 'partial',
    cursor: 'unsupported',
    notes: 'Native-only event; current managed wp-* surface does not emit a dedicated subagent-stop hook',
  },
  {
    event: 'SessionEnd',
    claude: 'partial',
    codex: 'unsupported',
    cursor: 'unsupported',
    notes:
      'Claude documents this cleanup event, but the current managed wp-* surface does not emit a dedicated session-end hook',
  },
  {
    event: 'PreCompact',
    claude: 'partial',
    codex: 'partial',
    cursor: 'unsupported',
    notes:
      'Accepted in lifecycle tooling, but the current managed wp-* surface does not install a dedicated pre-compact hook',
  },
  {
    event: 'PostCompact',
    claude: 'partial',
    codex: 'partial',
    cursor: 'unsupported',
    notes:
      'Accepted in lifecycle tooling, but the current managed wp-* surface does not install a dedicated post-compact hook',
  },
]
