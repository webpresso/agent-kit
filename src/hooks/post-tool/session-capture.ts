#!/usr/bin/env bun
/**
 * PostToolUse hook: session-capture via ctx-rs FFI.
 *
 * Captures tool output from Bash, Read, Grep, WebFetch, and MCP tool calls
 * into the session knowledge-base using the ctx-rs Rust engine (or TS fallback).
 * This is the passive capture path that runs after every matched tool call.
 *
 * Matched by plugin.json: "Edit|Write|MultiEdit|Bash|Read|Grep|WebFetch|mcp__"
 *
 * Tool type → content key mapping:
 *   Bash        → command string (content = stdout + stderr)
 *   Edit/Write  → file path (content = new_string / content field)
 *   MultiEdit   → file path (content = edits summary)
 *   Read        → file path (content = file body in tool_response)
 *   Grep        → pattern string (content = matches)
 *   WebFetch    → URL (content = truncated body)
 *   mcp__*      → tool name (content = response JSON)
 *
 * Capture is non-blocking and non-fatal: errors are logged to stderr only.
 * The hook always writes `{}` (passthrough) so Claude Code proceeds normally.
 *
 * Output sandboxing (active filtering) is provided by ak_session_execute and
 * ak_session_batch_execute. This hook is for passive background capture only.
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'

import { runHook } from '#hooks/shared/hook-bootstrap'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PostToolInput {
  readonly session_id?: string
  readonly tool_name?: string
  readonly tool_input?: Record<string, unknown>
  readonly tool_response?: unknown
  readonly cwd?: string
}

interface CaptureChunk {
  readonly source: string
  readonly content: string
}

// ── Content extraction ────────────────────────────────────────────────────────

const MAX_CAPTURE_BYTES = 128 * 1024 // 128KB max per capture

function capBytes(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, 'utf8')
  if (buf.length <= maxBytes) return s
  return buf.slice(0, maxBytes).toString('utf8') + '\n[truncated]'
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractChunk(input: PostToolInput): CaptureChunk | null {
  const toolName = input.tool_name ?? ''
  const toolInput = input.tool_input ?? {}
  const toolResponse = input.tool_response

  // Bash: capture command + stdout/stderr from response
  if (toolName === 'Bash') {
    const command = typeof toolInput['command'] === 'string' ? toolInput['command'] : 'bash'
    const output = safeStringify(toolResponse)
    if (output.length === 0) return null
    return { source: `bash:${command.slice(0, 80)}`, content: capBytes(output, MAX_CAPTURE_BYTES) }
  }

  // Edit / Write / MultiEdit: capture file path + content written
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'MultiEdit') {
    const filePath = typeof toolInput['file_path'] === 'string' ? toolInput['file_path'] : null
    if (!filePath) return null
    const content =
      typeof toolInput['content'] === 'string'
        ? toolInput['content']
        : typeof toolInput['new_string'] === 'string'
          ? toolInput['new_string']
          : safeStringify(toolInput)
    return { source: `file:${filePath}`, content: capBytes(content, MAX_CAPTURE_BYTES) }
  }

  // Read: capture file path + body from response
  if (toolName === 'Read') {
    const filePath = typeof toolInput['file_path'] === 'string' ? toolInput['file_path'] : null
    if (!filePath) return null
    const body = safeStringify(toolResponse)
    if (body.length === 0) return null
    return { source: `read:${filePath}`, content: capBytes(body, MAX_CAPTURE_BYTES) }
  }

  // Grep: capture pattern + matches from response
  if (toolName === 'Grep') {
    const pattern = typeof toolInput['pattern'] === 'string' ? toolInput['pattern'] : 'grep'
    const matches = safeStringify(toolResponse)
    if (matches.length === 0) return null
    return { source: `grep:${pattern.slice(0, 80)}`, content: capBytes(matches, MAX_CAPTURE_BYTES) }
  }

  // WebFetch: capture URL + truncated body from response
  if (toolName === 'WebFetch') {
    const url = typeof toolInput['url'] === 'string' ? toolInput['url'] : 'web'
    const body = safeStringify(toolResponse)
    if (body.length === 0) return null
    return { source: `web:${url.slice(0, 100)}`, content: capBytes(body, MAX_CAPTURE_BYTES) }
  }

  // MCP tools (mcp__*): capture tool name + response JSON
  if (toolName.startsWith('mcp__')) {
    const response = safeStringify(toolResponse)
    if (response.length === 0) return null
    return { source: `mcp:${toolName.slice(0, 80)}`, content: capBytes(response, MAX_CAPTURE_BYTES) }
  }

  return null
}

// ── DB path resolution ────────────────────────────────────────────────────────

function resolveDbPath(): string {
  const repoHash = process.env['CLAUDE_REPO_HASH'] ?? process.env['AK_REPO_HASH'] ?? 'default'
  const dbDir = join(homedir(), '.webpresso', 'sessions')
  mkdirSync(dbDir, { recursive: true })
  return join(dbDir, `${repoHash}.db`)
}

// ── Capture via ctx-rs (sync FFI) ────────────────────────────────────────────

function captureChunk(chunk: CaptureChunk): void {
  try {
    const dbPath = resolveDbPath()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getStore } = require('../../session-memory/store.js') as {
      getStore: (dbPath: string) => {
        insertChunks: (chunks: readonly { source: string; content: string }[]) => void
      }
    }
    const store = getStore(dbPath)
    store.insertChunks([{ source: chunk.source, content: chunk.content }])
  } catch (err) {
    process.stderr.write(
      `ak-post-tool-session-capture: indexing failed for "${chunk.source}": ${(err as Error).message}\n`,
    )
  }
}

// ── Hook entry point ──────────────────────────────────────────────────────────

export function processCapture(input: PostToolInput): null {
  const chunk = extractChunk(input)
  if (chunk !== null && chunk.content.trim().length > 0) {
    captureChunk(chunk)
  }
  return null // always passthrough
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  runHook(
    (input) => processCapture(input as PostToolInput),
    () => '{}',
  )
}
