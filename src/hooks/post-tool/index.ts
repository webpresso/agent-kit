#!/usr/bin/env bun
/**
 * PostToolUse dispatcher — runs after each tool invocation.
 *
 * Dispatches to:
 *   1. lint-after-edit (preserves existing behavior)
 *   2. session-capture (new — records tool event into session memory)
 *
 * Failure isolation: if session-capture throws, lint-after-edit result is
 * still returned. Hook always exits 0 — never blocks the tool call chain.
 *
 * Input (stdin): PostToolUse JSON payload from Claude Code
 * Output (stdout): `{}` (passthrough — Claude proceeds normally)
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { runHook } from '#hooks/shared/hook-bootstrap'
import type { ToolInput } from '#hooks/shared/types'
import { processPostToolUse } from './lint-after-edit.js'
import { captureToolEvent } from './session-capture.js'

export function processDispatch(input: ToolInput): null {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const sessionId = process.env.CLAUDE_SESSION_ID ?? 'unknown'

  // 1. Lint-after-edit (existing behavior)
  try {
    processPostToolUse(input, projectDir)
  } catch (err) {
    process.stderr.write(
      `ak-post-tool: lint-after-edit error: ${(err as Error).message}\n`,
    )
  }

  // 2. Session capture (new — failure must not block lint result)
  try {
    captureToolEvent(input, sessionId)
  } catch (err) {
    process.stderr.write(
      `ak-post-tool: session-capture error: ${(err as Error).message}\n`,
    )
  }

  // Always return null → dispatcher writes '{}'
  return null
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  void runHook(
    (input) => processDispatch(input as ToolInput),
    () => '{}',
  )
}
