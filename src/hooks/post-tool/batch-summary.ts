import type { ToolInput } from '#hooks/shared/types'
import { redactText } from '#mcp/tools/_shared/redact'

export const DEFAULT_BATCH_PREVIEW_BYTES = 768

export interface PostToolBatchSummary {
  readonly toolNames: readonly string[]
  readonly successCount: number
  readonly failureCount: number
  readonly totalResultBytes: number
  readonly truncated: boolean
  readonly preview: string
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function capUtf8Bytes(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (byteLength(value) <= maxBytes) return { value, truncated: false }
  let bytes = 0
  let capped = ''
  for (const char of value) {
    const charBytes = byteLength(char)
    if (bytes + charBytes > maxBytes) break
    capped += char
    bytes += charBytes
  }
  return { value: capped, truncated: true }
}

function stableStringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function resultPayload(entry: Record<string, unknown>): { text: string; failed: boolean } {
  const failed = entry.error !== undefined || entry.is_error === true || entry.ok === false
  const payload = entry.response ?? entry.result ?? entry.output ?? entry.error ?? entry.content ?? entry
  return { text: stableStringify(payload), failed }
}

function toolNameFor(entry: Record<string, unknown>, fallbackIndex: number): string {
  for (const key of ['tool_name', 'toolName', 'name', 'tool']) {
    const value = entry[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return `tool_${fallbackIndex + 1}`
}

function batchEntries(input: ToolInput): Record<string, unknown>[] {
  const toolInput = input.tool_input ?? {}
  const candidates = [toolInput.tool_calls, toolInput.toolCalls, toolInput.results, toolInput.responses]
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    return candidate.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null)
  }
  return []
}

export function buildPostToolBatchSummary(
  input: ToolInput,
  maxPreviewBytes = DEFAULT_BATCH_PREVIEW_BYTES,
): PostToolBatchSummary {
  const entries = batchEntries(input)
  const toolNames: string[] = []
  let successCount = 0
  let failureCount = 0
  let totalResultBytes = 0
  let preview = ''
  let truncated = false

  entries.forEach((entry, index) => {
    const toolName = toolNameFor(entry, index)
    const payload = resultPayload(entry)
    const redacted = redactText(payload.text) ?? ''
    totalResultBytes += byteLength(payload.text)
    if (payload.failed) failureCount += 1
    else successCount += 1
    toolNames.push(toolName)
    const line = `${toolName}: ${redacted.replace(/\s+/gu, ' ').trim()}`
    const cappedLine = capUtf8Bytes(line, 220)
    truncated ||= cappedLine.truncated
    preview += `${preview ? '\n' : ''}${cappedLine.value}`
  })

  const cappedPreview = capUtf8Bytes(preview, maxPreviewBytes)
  return {
    toolNames,
    successCount,
    failureCount,
    totalResultBytes,
    truncated: truncated || cappedPreview.truncated,
    preview: cappedPreview.value,
  }
}
