/**
 * Capability matrix — per-vendor, per-event hook support data.
 *
 * Documents what each agent CLI supports for each hook event, based on
 * official docs. Used by T13 (status), T14 (deny), and T22 (audit) to
 * explain gaps and emit correct per-vendor configurations.
 *
 * cursor column reflects the emitted Cursor hooks.json surface plus the
 * documented third-party compatibility caveats (opt-in compat, required
 * `version: 1`, and unmapped events: PermissionRequest and Notification
 * are NOT mapped in Cursor's third-party compatibility table).
 *
 * opencode column reflects the JS plugin API surface (opencode.ai/docs/plugins/):
 * - session.created / experimental.session.compacting → SessionStart (full)
 * - tool.execute.before / after → PreToolUse / PostToolUse (full)
 * - permission.asked / replied → PermissionRequest (partial — no deny envelope)
 * - experimental.session.compacting fires before compaction → PreCompact (partial)
 * - No UserPromptSubmit, Stop, SubagentStart/Stop, SessionEnd, PostCompact equivalent
 */

export type SupportLevel = 'full' | 'partial' | 'unmapped' | 'unsupported'

export type VendorCapability = {
  readonly event: string
  readonly claude: SupportLevel
  readonly codex: SupportLevel
  readonly cursor: SupportLevel
  readonly opencode: SupportLevel
  readonly notes?: string
}

/**
 * Canonical capability matrix for all hook events across supported agent CLIs.
 *
 * claude/codex are Tier 1 CLIs (see supported-agent-clis.md).
 * cursor/opencode are Tier 2 CLIs — best-effort, documented degradations.
 */
export const CAPABILITY_MATRIX: readonly VendorCapability[] = [
  {
    event: 'SessionStart',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
    opencode: 'full',
    notes:
      'Cursor requires project hooks.json with version: 1; OpenCode bridges via session.created + experimental.session.compacting',
  },
  {
    event: 'PreToolUse',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
    opencode: 'full',
    notes: 'OpenCode bridges via tool.execute.before; deny translates to throw new Error(...)',
  },
  {
    event: 'PostToolUse',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
    opencode: 'full',
    notes: 'Cursor maps to afterShell; OpenCode bridges via tool.execute.after',
  },
  {
    event: 'PostToolUseFailure',
    claude: 'partial',
    codex: 'unsupported',
    cursor: 'unsupported',
    opencode: 'unsupported',
    notes:
      'Claude documents this event, but the current managed wp-* surface does not emit a dedicated failure hook',
  },
  {
    event: 'UserPromptSubmit',
    claude: 'full',
    codex: 'full',
    cursor: 'partial',
    opencode: 'unsupported',
    notes:
      'Cursor maps to beforeSubmitPrompt (third-party compat toggle required); OpenCode has no before-submit-prompt equivalent',
  },
  {
    event: 'Stop',
    claude: 'full',
    codex: 'full',
    cursor: 'full',
    opencode: 'unsupported',
    notes:
      'Cursor maps to afterShell; OpenCode has no turn-end/stop lifecycle event. Codex mandates JSON-only stdout for Stop (plain text is invalid)',
  },
  {
    event: 'PermissionRequest',
    claude: 'partial',
    codex: 'partial',
    cursor: 'unmapped',
    opencode: 'partial',
    notes:
      'Cursor: not mapped in third-party compat table. OpenCode: permission.asked/replied exist but no deny-envelope parity with Claude/Codex. Current managed wp-* surface does not install a dedicated permission hook',
  },
  {
    event: 'SubagentStart',
    claude: 'partial',
    codex: 'partial',
    cursor: 'unsupported',
    opencode: 'unsupported',
    notes:
      'Native-only event; current managed wp-* surface does not emit a dedicated subagent-start hook. Codex mandates JSON-only stdout for SubagentStop',
  },
  {
    event: 'SubagentStop',
    claude: 'partial',
    codex: 'partial',
    cursor: 'unsupported',
    opencode: 'unsupported',
    notes:
      'Native-only event; current managed wp-* surface does not emit a dedicated subagent-stop hook. Codex mandates JSON-only stdout (plain text is invalid)',
  },
  {
    event: 'SessionEnd',
    claude: 'partial',
    codex: 'unsupported',
    cursor: 'unsupported',
    opencode: 'unsupported',
    notes:
      'Claude documents this cleanup event, but the current managed wp-* surface does not emit a dedicated session-end hook',
  },
  {
    event: 'PreCompact',
    claude: 'full',
    codex: 'full',
    cursor: 'unsupported',
    opencode: 'partial',
    notes:
      'Managed wp-pre-compact snapshots session events before compaction. OpenCode experimental.session.compacting fires before compaction',
  },
  {
    event: 'PostCompact',
    claude: 'partial',
    codex: 'partial',
    cursor: 'unsupported',
    opencode: 'unsupported',
    notes:
      'Accepted in lifecycle tooling, but the current managed wp-* surface does not install a dedicated post-compact hook. OpenCode has no post-compaction event',
  },
]
