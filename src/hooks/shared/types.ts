export interface ToolInput {
  session_id?: string
  transcript_path?: string
  cwd?: string
  hook_event_name?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
}

export interface ValidationResult {
  validator: string
  passed: boolean
  message?: string
  skipped?: boolean
  skipReason?: string
}

export function parseToolInput(json: string): ToolInput {
  return JSON.parse(json) as ToolInput
}

export function isBashInput(input: ToolInput): boolean {
  return 'command' in (input.tool_input || {})
}

export function isFileEditInput(input: ToolInput): boolean {
  const toolInput = input.tool_input || {}
  return 'file_path' in toolInput && 'old_string' in toolInput && 'new_string' in toolInput
}

export function isFileWriteInput(input: ToolInput): boolean {
  const toolInput = input.tool_input || {}
  return 'file_path' in toolInput && 'content' in toolInput
}

export function isFileReadInput(input: ToolInput): boolean {
  const toolInput = input.tool_input || {}
  return 'file_path' in toolInput && !('content' in toolInput) && !('old_string' in toolInput)
}

export function getFilePath(input: ToolInput): string | undefined {
  const toolInput = input.tool_input as Record<string, unknown> | undefined
  if (!toolInput || typeof toolInput !== 'object') return undefined
  const filePath = toolInput.file_path
  return typeof filePath === 'string' ? filePath : undefined
}

export function getCommand(input: ToolInput): string | undefined {
  if (isBashInput(input)) {
    const toolInput = input.tool_input as Record<string, unknown> | undefined
    if (!toolInput || typeof toolInput !== 'object') return undefined
    const command = toolInput.command
    return typeof command === 'string' ? command : undefined
  }
  return undefined
}

export function getContent(input: ToolInput): string | undefined {
  const toolInput = input.tool_input as Record<string, unknown> | undefined
  if (!toolInput || typeof toolInput !== 'object') return undefined
  const content = toolInput.content
  const newString = toolInput.new_string
  if (typeof content === 'string') return content
  if (typeof newString === 'string') return newString
  return undefined
}

// ---------------------------------------------------------------------------
// Deny envelope — emitted to stdout by pretool-guard
// ---------------------------------------------------------------------------

/**
 * The shape of a deny envelope emitted to stdout by pretool-guard.
 * Must be valid JSON on stdout (Claude Code / Codex PreToolUse requirement).
 */
export type DenyEnvelope = {
  readonly hookSpecificOutput: {
    readonly hookEventName: 'PreToolUse'
    readonly permissionDecision: 'deny'
    /** SHORT user-facing reason (≤80 chars) */
    readonly permissionDecisionReason: string
  }
  /** When present, user can run `wp hooks deny --explain <logId>` for full context. */
  readonly logId?: string
  /** POLICY-ONLY: explains how to legitimately bypass the denial. */
  readonly escapeHatch?: string
}

/**
 * The shape of an infrastructure-failure deny (guard binary missing, etc.).
 * Differs from policy deny: isInfraFailure is true and escapeHatch = 'wp setup'.
 */
export type InfraDenyEnvelope = DenyEnvelope & {
  readonly isInfraFailure: true
}

/** Build a policy deny envelope with an optional log ID and escape hatch. */
export function buildDenyEnvelope(options: {
  readonly reason: string
  readonly logId?: string
  readonly escapeHatch?: string
}): DenyEnvelope {
  const envelope: {
    hookSpecificOutput: DenyEnvelope['hookSpecificOutput']
    logId?: string
    escapeHatch?: string
  } = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: options.reason,
    },
  }
  if (options.logId !== undefined) envelope.logId = options.logId
  if (options.escapeHatch !== undefined) envelope.escapeHatch = options.escapeHatch
  return envelope
}

/** Build an infrastructure-failure deny envelope. */
export function buildInfraDenyEnvelope(options: {
  readonly reason: string
}): InfraDenyEnvelope {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: options.reason,
    },
    isInfraFailure: true,
    escapeHatch: 'wp setup',
  }
}
